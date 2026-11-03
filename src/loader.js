// Static content scripts can't be ES modules, so load the real one with a dynamic import.
import(chrome.runtime.getURL('src/content.js'));
