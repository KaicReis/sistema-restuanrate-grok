declare module "pdf-parse/lib/pdf-parse.js" {
  import pdf = require("pdf-parse");
  const parse: (data: Uint8Array, options?: pdf.Options) => Promise<pdf.Result>;
  export default parse;
}
