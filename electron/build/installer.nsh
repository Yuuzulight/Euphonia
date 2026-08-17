; One-time relocation of the install folder.
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
; This is single-use. Once everyone has upgraded past it, the whole file can go
; (along with the nsis.include line in electron-builder.yml that pulls it in).

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
