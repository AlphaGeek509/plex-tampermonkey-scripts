var QTCommon = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/common/index.js
  var index_exports = {};
  __export(index_exports, {
    createGatedComputed: () => createGatedComputed,
    startGateOnFirstUserEdit: () => startGateOnFirstUserEdit
  });

  // src/common/computeGate.js
  function createGatedComputed({ ko, read }) {
    const started = ko.observable(false);
    let last;
    let hasLast = false;
    const comp = ko.pureComputed(() => {
      if (!started()) {
        return hasLast ? last : void 0;
      }
      const value = read();
      last = value;
      hasLast = true;
      return value;
    });
    function start() {
      started(true);
    }
    function stop() {
      started(false);
    }
    return { computed: comp, start, stop, isStarted: started };
  }

  // src/common/userStart.js
  function startGateOnFirstUserEdit({ gate, inputEl }) {
    const isStarted = () => typeof gate.isStarted === "function" ? !!gate.isStarted() : !!gate.isStarted;
    const once = () => {
      if (!isStarted()) gate.start();
      inputEl.removeEventListener("input", once);
      inputEl.removeEventListener("change", once);
    };
    inputEl.addEventListener("input", once);
    inputEl.addEventListener("change", once);
  }
  return __toCommonJS(index_exports);
})();
