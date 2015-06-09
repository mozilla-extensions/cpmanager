#include "stdafx.h"
#include <Shlobj.h>
#include <tchar.h>

void setClipboard(LPCTSTR path)
{
  HWND owner = GetClipboardOwner();
  if (!OpenClipboard(owner))
    return;

  UINT format = 0;
  HGLOBAL hBitmapMem = NULL;
  HGLOBAL hHTMLMem = NULL;
  BOOL setBitmap = FALSE;
  BOOL setHTML = FALSE;
  LPBITMAPINFO lpBitmap = NULL;
  const int CF_HTML = RegisterClipboardFormat(_T("HTML Format"));
  const int TEXT_HTML = RegisterClipboardFormat(_T("text/html"));

  while(format = EnumClipboardFormats(format))
  {
    if (!IsClipboardFormatAvailable(format))
      continue;
    HGLOBAL hMemObj = GetClipboardData(format);
    if (!hMemObj)
      continue;

    switch(format) {
      case CF_DIB:
        lpBitmap = (LPBITMAPINFO)GlobalLock(hMemObj);
        if (lpBitmap)
        {
          int bufferSize = lpBitmap->bmiHeader.biSize + lpBitmap->bmiHeader.biSizeImage;
          hBitmapMem = GlobalAlloc(GMEM_MOVEABLE, bufferSize);
          if (hBitmapMem)
          {
            char* pBitmapMem = (char*)GlobalLock(hBitmapMem);
            if (pBitmapMem)
            {
              memcpy(pBitmapMem, lpBitmap, bufferSize);
              setBitmap = TRUE;
              GlobalUnlock(hBitmapMem);
            }
          }
          GlobalUnlock(hMemObj);
        }
        break;
      default:
        if (format == CF_HTML)
        {
          char* pHtml = (char*)GlobalLock(hMemObj);
          if (pHtml)
          {
            int htmlSize = strlen(pHtml) + 1;
            hHTMLMem = GlobalAlloc(GMEM_MOVEABLE, htmlSize);
            if (hHTMLMem)
            {
              char* pHtmlStr = (char*)GlobalLock(hHTMLMem);
              if (pHtmlStr)
              {
                memcpy(pHtmlStr, pHtml, htmlSize);
                setHTML = TRUE;
                GlobalUnlock(hHTMLMem);
              }
            }
            GlobalUnlock(hMemObj);
          }
        }
      break;
    }
  }

  EmptyClipboard();

  if (setBitmap)
    SetClipboardData(CF_DIB, hBitmapMem);
  if (setHTML)
    SetClipboardData(CF_HTML, hHTMLMem);

  HGLOBAL hGlobalMemory = NULL;
  int pathLength = (_tcslen(path) + 2) * sizeof(TCHAR);
  int memSize = sizeof(DROPFILES) + pathLength;
  hGlobalMemory = GlobalAlloc(GMEM_MOVEABLE, memSize);
  //ZeroMemory(hGlobalMemory, memSize);
  DROPFILES* pDropFile = (DROPFILES*)GlobalLock(hGlobalMemory);

  // First, populate the drop file structure.
  pDropFile->pFiles = sizeof(DROPFILES); // Offset to start of file name char array.
  pDropFile->fNC    = 0;
  pDropFile->pt.x   = 0;
  pDropFile->pt.y   = 0;
  pDropFile->fWide  = TRUE;

  // Copy the filename right after the DROPFILES structure.
  LPTSTR dest = (LPTSTR)(((char*)pDropFile) + pDropFile->pFiles);
  memcpy(dest, path, pathLength); // Copies the null character in path as well.
  dest[_tcslen(path) + 1] = 0;

  GlobalUnlock(hGlobalMemory);
  SetClipboardData(CF_HDROP,hGlobalMemory);
  CloseClipboard();
}
