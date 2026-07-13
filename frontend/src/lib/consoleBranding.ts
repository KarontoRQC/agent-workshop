const CONSOLE_BRANDING_FLAG = '__jarvisConsoleBrandingPrinted__';

const CONSOLE_BEAST = String.raw`#        ┏┓　　　┏┓+ +
#　　　┏┛┻━━━┛┻┓ + +
#　　　┃　　　　　　　┃
#　　　┃　　　━　　　┃ ++ + + +
#　　 ████━████ ┃+
#　　　┃　　　　　　　┃ +
#　　　┃　　　┻　　　┃
#　　　┃　　　　　　　┃ + +
#　　　┗━┓　　　┏━┛
#　　　　　┃　　　┃
#　　　　　┃　　　┃ + + + +
#　　　　　┃　　　┃　　　　Codes are far away from bugs with the animal protecting
#　　　　　┃　　　┃ + 　　　　神兽保佑,代码无bug
#　　　　　┃　　　┃
#　　　　　┃　　　┃　　+
#　　　　　┃　 　　┗━━━┓ + +
#　　　　　┃ 　　　　　　　┣┓
#　　　　　┃ 　　　　　　　┏┛
#　　　　　┗┓┓┏━┳┓┏┛ + + + +
#　　　　　　┃┫┫　┃┫┫
#　　　　　　┗┻┛　┗┻┛+ + + +`;

export function printConsoleBranding(): void {
  const runtime = globalThis as typeof globalThis & { [CONSOLE_BRANDING_FLAG]?: boolean };
  if (runtime[CONSOLE_BRANDING_FLAG]) return;
  runtime[CONSOLE_BRANDING_FLAG] = true;

  console.log(CONSOLE_BEAST);
}
