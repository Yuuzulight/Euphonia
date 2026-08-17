; NSIS customizations compiled into the installer and uninstaller.
;
; Two unrelated things live here:
;   1. a one-time relocation of the install folder (single-use, see below)
;   2. the "delete your data too?" prompt on uninstall (permanent)


; ---------------------------------------------------------------------------
; 1. One-time relocation of the install folder.
;
; Up to 0.5.0 the app installed to %LOCALAPPDATA%\Programs\euphonia-electron,
; because electron-builder names the folder after the package rather than
; productName for a one-click per-user installer (see getWindowsInstallationDirName:
; it only consults productName when !oneClick || isPerMachine, which is false here).
; The package is named Euphonia now, so fresh installs land in the right place —
; but an upgrade would otherwise stay in the old folder forever, since
; setInstallModePerUser reuses whatever InstallLocation the registry records.
;
; preInit runs at the top of .onInit, BEFORE initMultiUser reads that value, so
; rewriting it here is what actually moves the install. customInstall then removes
; what we left behind, since after the rewrite the installer no longer knows the
; old directory exists and would otherwise strand ~550 MB of orphan.
;
; This part is single-use. Once everyone has upgraded past it, preInit and
; customInstall below can both go; part 2 stays.
; ---------------------------------------------------------------------------

!define EUPH_OLD_DIR "$LOCALAPPDATA\Programs\euphonia-electron"

!macro preInit
  ; Only relocate an install sitting in the old DEFAULT location. Anyone who
  ; chose their own directory (installer /D switch) keeps it — silently moving
  ; someone's deliberate choice would be worse than the untidy folder name.
  ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R9 == "${EUPH_OLD_DIR}"
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\Euphonia"
  ${endif}
!macroend

!macro customInstall
  ; Files are installed at this point. Nothing here depends on what preInit did:
  ; the old path is a constant, so recomputing it beats carrying state between two
  ; macros that run in different phases (an earlier version passed a marker through
  ; the registry and the cleanup silently did nothing).
  ;
  ; app.asar is the guard. The folder name alone is ours, but a recursive delete
  ; deserves proof that what's inside is an install rather than a folder someone
  ; happened to keep their own files in.
  ${if} $INSTDIR != "${EUPH_OLD_DIR}"
  ${andif} ${FileExists} "${EUPH_OLD_DIR}\resources\app.asar"
    RMDir /r "${EUPH_OLD_DIR}"
  ${endif}
!macroend


; ---------------------------------------------------------------------------
; 2. Offer to delete the user's data when they uninstall.
;
; electron-builder can do this via deleteAppDataOnUninstall, but that deletes
; unconditionally with no way to say no, and it only looks in %APPDATA% — it
; would leave the electron-updater caches in %LOCALAPPDATA% behind. So: ask,
; and clean up the full set ourselves.
;
; Every path below is written out in full and deleted only after something
; inside it proves it is ours. Nothing is derived from ${APP_FILENAME} and
; friends, which resolve to whatever the package happens to be called.
;
; Scoped to the uninstaller pass. This file is compiled into both, but only the
; uninstaller inserts these macros, so in the installer pass euphDeleteData is a
; variable nobody touches — and electron-builder builds NSIS with warnings as
; errors, so that alone fails the build.
; ---------------------------------------------------------------------------

!ifdef BUILD_UNINSTALLER

; userData, current and pre-productName (see migrateUserDataIfNeeded in paths.ts)
!define EUPH_DATA_ROAMING     "$APPDATA\Euphonia"
!define EUPH_DATA_ROAMING_OLD "$APPDATA\euphonia-electron"
; electron-updater's download cache, named after app.getName()
!define EUPH_DATA_UPDATER     "$LOCALAPPDATA\euphonia-updater"
!define EUPH_DATA_UPDATER_OLD "$LOCALAPPDATA\euphonia-electron-updater"

Var euphDeleteData

; Remove one directory, but only once its contents identify it. The paths are
; hardcoded, so this is belt and braces — but a recursive delete under %APPDATA%
; should have to prove itself.
!macro euphRemoveDataDir DIR SENTINEL_A SENTINEL_B
  ${if} ${FileExists} "${DIR}\${SENTINEL_A}"
  ${orif} ${FileExists} "${DIR}\${SENTINEL_B}"
    RMDir /r "${DIR}"
  ${endif}
!macroend

!macro customUnInit
  StrCpy $euphDeleteData "0"

  ; Work out whether a person is uninstalling or the installer is swapping
  ; versions underneath them. ${Silent} is no help: for a one-click installer
  ; un.onInit forces silent mode before any hook runs, so a real uninstall looks
  ; silent too. The command line does distinguish them — an upgrade runs the old
  ; uninstaller as `/S /KEEP_APP_DATA ... --updated`.
  ${GetParameters} $R0

  ClearErrors
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${ifNot} ${Errors}
    ; asked for outright, don't second-guess it
    StrCpy $euphDeleteData "1"
  ${else}
    ClearErrors
    ${GetOptions} $R0 "--updated" $R1
    ${if} ${Errors}
      ClearErrors
      ${GetOptions} $R0 "/KEEP_APP_DATA" $R1
      ${if} ${Errors}
        ClearErrors
        ${GetOptions} $R0 "/S" $R1
        ${if} ${Errors}
          ; Nothing on the command line says otherwise, so there is someone here
          ; to answer. Default to keeping the data: it is the only irreversible
          ; half of an uninstall, and it is the answer they can still change later.
          ;
          ; Drop out of silent mode across the prompt. un.onInit forces silent for
          ; a one-click uninstaller once the user confirms, and NSIS does not draw
          ; MessageBox at all while silent — it just returns the /SD answer. Without
          ; this the prompt is never seen and everyone silently gets "No".
          ; Safe because we only get here with no /S on the command line, and this
          ; runs inside un.onInit, the only place SetSilent is allowed.
          SetSilent normal
          MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
            "Also delete your recordings and settings?$\r$\n$\r$\nThis permanently removes your recordings, their analysis, your saved insights and your theme from this computer. There is no undo.$\r$\n$\r$\nChoose No to leave them where they are — reinstalling Euphonia later will pick them up again." \
            /SD IDNO IDNO euphKeepData
          StrCpy $euphDeleteData "1"
          euphKeepData:
          ; back to what un.onInit had set, so the uninstall itself stays quiet
          SetSilent silent
        ${endif}
      ${endif}
    ${endif}
  ${endif}
!macroend

!macro customUnInstall
  ${if} $euphDeleteData == "1"
    ; Electron keeps user data under the current user even for an all-users
    ; install, so read those paths as that user rather than the installing one.
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}

    ; recordings.json and theme.json are ours; Preferences covers a userData
    ; directory that exists but has not been recorded into yet.
    !insertmacro euphRemoveDataDir "${EUPH_DATA_ROAMING}"     "recordings.json" "Preferences"
    !insertmacro euphRemoveDataDir "${EUPH_DATA_ROAMING_OLD}" "recordings.json" "Preferences"

    ; Update caches: a downloaded installer and nothing else. No sentinel here —
    ; these names collide with nothing, and a content check could only fail
    ; closed and leave a stale 190 MB download behind.
    RMDir /r "${EUPH_DATA_UPDATER}"
    RMDir /r "${EUPH_DATA_UPDATER_OLD}"

    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${endif}
!macroend

!endif ; BUILD_UNINSTALLER
