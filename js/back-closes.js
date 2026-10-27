// Phone Back button / back swipe closes what's open instead of leaving the page.
//
// Pages here open things in place (full-screen tabs, recap pop-ups, the
// profile drawer, chat…) without changing the address, so the phone's Back
// used to skip right past them and leave the page — or, in the home-screen
// app, close it. Each page registers its pop-ups with FRBackCloses.watch():
//   FRBackCloses.watch([ { isOpen: fn → bool, close: fn }, … ])
// Listed in priority order: the topmost thing first.
// While anything is open we keep one extra history entry; Back pops it and
// we close the topmost item. Closing with the on-screen ✕ quietly removes
// that entry, so Back never needs an extra press.
(function (global) {
  'use strict';
  var items = [];
  var pushed = false;   // our extra history entry is on top
  var swallow = false;  // the next popstate came from us, not the person
  var scheduled = false;

  function topOpen() {
    for (var i = 0; i < items.length; i++) {
      try { if (items[i].isOpen()) return items[i]; } catch (e) {}
    }
    return null;
  }

  function sync() {
    scheduled = false;
    var open = !!topOpen();
    if (open && !pushed) {
      try { history.pushState({ frOverlay: true }, ''); pushed = true; } catch (e) {}
    } else if (!open && pushed) {
      pushed = false;
      if (history.state && history.state.frOverlay) { swallow = true; try { history.back(); } catch (e) { swallow = false; } }
    }
  }
  function later() { if (!scheduled) { scheduled = true; setTimeout(sync, 120); } }

  global.addEventListener('popstate', function () {
    if (swallow) { swallow = false; return; }
    if (!pushed) return;          // not ours — normal navigation
    pushed = false;
    var item = topOpen();
    if (item) { try { item.close(); } catch (e) {} }
    later();                      // something else still open → re-arm
  });

  function watch(list) {
    items = list || [];
    try {
      new MutationObserver(later).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'], childList: true });
    } catch (e) {}
    later();
  }

  global.FRBackCloses = { watch: watch, _sync: sync, _topOpen: topOpen };
})(typeof window !== 'undefined' ? window : globalThis);
