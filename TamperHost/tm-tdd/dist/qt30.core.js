var QT30Core = (() => {
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

  // src/qt30/init.js
  var init_exports = {};
  __export(init_exports, {
    attachQuoteModalHandlers: () => attachQuoteModalHandlers,
    ensureButtons: () => ensureButtons
  });
  function attachQuoteModalHandlers({ root, ensureButtons: ensureButtons2 }) {
    return {
      open(modalEl) {
        ensureButtons2({ modalEl, root });
      }
    };
  }
  function ensureButtons({ modalEl }) {
    const id = "qt30-actions";
    if (modalEl.querySelector(`#${id}`)) return;
    const doc = modalEl.ownerDocument || document;
    const bar = modalEl.querySelector(".modal-toolbar") ?? modalEl;
    const wrapper = doc.createElement("div");
    wrapper.id = id;
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = "Attach";
    btn.setAttribute("title", "Attach file to quote");
    wrapper.appendChild(btn);
    bar.appendChild(wrapper);
  }
  return __toCommonJS(init_exports);
})();
