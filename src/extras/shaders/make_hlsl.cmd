@echo off
for %%f in (*PS.hlsl) do "%DXSDK_DIR%\Utilities\bin\x86\fxc.exe" /T ps_2_0 /nologo /E main /Fo obj\%%~nf.cso %%f
for %%f in (*VS.hlsl) do "%DXSDK_DIR%\Utilities\bin\x86\fxc.exe" /T vs_2_0 /nologo /E main /Fo obj\%%~nf.cso %%f
rem these need more than the 64 arithmetic instructions ps_2_0 allows
for %%f in (fxaa_PS.hlsl modernGrade_PS.hlsl) do "%DXSDK_DIR%\Utilities\bin\x86\fxc.exe" /T ps_2_a /nologo /E main /Fo obj\%%~nf.cso %%f
