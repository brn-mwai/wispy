declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";

  interface MarkedTerminalOptions {
    reflowText?: boolean;
    width?: number;
    tab?: number;
    code?: any;
    codespan?: any;
    blockquote?: any;
    link?: any;
    href?: any;
    strong?: any;
    em?: any;
    del?: any;
    heading?: any;
    listitem?: any;
    table?: any;
    paragraph?: any;
    [key: string]: any;
  }

  function markedTerminal(options?: MarkedTerminalOptions): MarkedExtension;
  export default markedTerminal;
}
