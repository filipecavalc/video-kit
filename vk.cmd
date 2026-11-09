@echo off
rem video-kit entry point (vk --help lists every command). In PowerShell, run it as .\vk
"%~dp0py\main\.venv\Scripts\python.exe" "%~dp0pipeline\build.py" %*
