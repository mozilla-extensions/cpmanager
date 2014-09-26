let doc = content.document;

let x = doc.documentElement.scrollLeft;
let y = doc.documentElement.scrollTop;
let w = doc.documentElement.clientWidth;
let h = doc.documentElement.clientHeight;

let canvas = doc.createElementNS('http://www.w3.org/1999/xhtml', 'html:canvas');
canvas.width = w;
canvas.height = h;

let ctx = canvas.getContext('2d');
ctx.drawWindow(content, x, y, w, h, 'rgba(255,255,255,0.5)');

sendAsyncMessage('cpmanager@mozillaonline.com:snapshot', ctx.getImageData(0, 0, w, h));
