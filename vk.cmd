@echo off
rem video-kit entry point: vk build <project>, vk new <project>, vk still, vk studio, vk voices
"%~dp0py\main\.venv\Scripts\python.exe" "%~dp0pipeline\build.py" %*
