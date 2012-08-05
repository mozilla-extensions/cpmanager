(function() {
var placeholder = {
  handleEvent: function placeholder__handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
    }
  },
  init: function placeholder__init(){
    var searchbar = document.getElementById("searchbar")
    if(!searchbar)
      return;
    function updateSearchbar(){
      var name = searchbar.currentEngine.name;
      searchbar._textbox.placeholder = name + " <Ctrl+K>";
    }
    var updateDisplay = searchbar.updateDisplay.bind(searchbar);
    searchbar.updateDisplay = (function() {
      updateDisplay();
      updateSearchbar();
    }).bind(searchbar);
    updateSearchbar();
  },
}
window.addEventListener('load'  , placeholder, false);
})();
