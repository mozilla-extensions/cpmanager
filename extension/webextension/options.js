window.addEventListener("DOMContentLoaded", evt => {
  browser.runtime.sendMessage({
    dir: "bg2legacy",
    type: "initOptions"
  }).then(initOptions => {
    for (let option in initOptions) {
      let p = document.createElement("p");

      let checkbox = document.createElement("input");
      checkbox.checked = initOptions[option];
      checkbox.id = option;
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", evt => {
        browser.runtime.sendMessage({
          dir: "bg2legacy",
          type: "updateOptions",
          detail: {
            [evt.target.id]: evt.target.checked
          }
        });
      });
      p.appendChild(checkbox);

      let label = document.createElement("label");
      label.setAttribute("for", option);
      let i18nKey = `option.${option}`;
      label.textContent = browser.i18n.getMessage(i18nKey);
      p.appendChild(label);

      document.body.appendChild(p);
    }
  });
});
