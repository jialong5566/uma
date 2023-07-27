// src/constants.ts
var MESSAGE_TYPE = /* @__PURE__ */ ((MESSAGE_TYPE2) => {
  MESSAGE_TYPE2["ok"] = "ok";
  MESSAGE_TYPE2["warnings"] = "warnings";
  MESSAGE_TYPE2["errors"] = "errors";
  MESSAGE_TYPE2["hash"] = "hash";
  MESSAGE_TYPE2["stillOk"] = "still-ok";
  MESSAGE_TYPE2["invalid"] = "invalid";
  return MESSAGE_TYPE2;
})(MESSAGE_TYPE || {});
var DEFAULT_BROWSER_TARGETS = {
  chrome: 80
};
var DEFAULT_DEVTOOL = "cheap-module-source-map";
var DEFAULT_OUTPUT_PATH = "dist";
export {
  DEFAULT_BROWSER_TARGETS,
  DEFAULT_DEVTOOL,
  DEFAULT_OUTPUT_PATH,
  MESSAGE_TYPE
};
