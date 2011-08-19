
#include "windows.h"

extern "C" void _declspec(dllexport) GetCommonAppdataFolder(wchar_t* retVal);
extern "C" void _declspec(dllexport) GetActivationKey(wchar_t* retVal);
extern "C" void _declspec(dllexport) GetID(wchar_t* retval);


  BOOL getMacByCmd(char *lpszMac, int length);
  BOOL getCPUID(char *lpszCPUID, int length);
  BOOL getHDSN(char *lpszHDSN, int length);

