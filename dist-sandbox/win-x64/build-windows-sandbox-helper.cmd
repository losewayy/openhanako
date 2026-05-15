@echo off
call "D:\VS2026\Common7\Tools\VsDevCmd.bat" -arch=x64
if errorlevel 1 exit /b %errorlevel%
cl.exe /nologo /EHsc /std:c++17 /W4 /O2 "D:\worktable\openhanako-UI\desktop\native\HanaWindowsSandboxHelper\main.cpp" /link /OUT:"D:\worktable\openhanako-UI\dist-sandbox\win-x64\hana-win-sandbox.exe" userenv.lib advapi32.lib
exit /b %errorlevel%
