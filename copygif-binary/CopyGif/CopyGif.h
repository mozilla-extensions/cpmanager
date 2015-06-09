#include <Windows.h>

#define FUNCSDLL_API __declspec(dllexport)

void FUNCSDLL_API setClipboard(LPCTSTR);