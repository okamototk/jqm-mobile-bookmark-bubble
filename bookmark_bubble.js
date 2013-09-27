/*
  Modified by Robert Gerald Porter, for Weever Apps Inc.

  Version:  1.1.3
  Release:  October 21, 2011

  Based upon Mobile Bookmark Bubble by Google Inc., original copyrights and license below.

  Changelog:

  1.0.1  :  - First public release of fork.
          - Added support for Android phones, Blackberry Touch Smartphones (OS6+), BlackBerry PlayBook.
          - Modified colour and layout.
          - Added WebkitBackgroundSize = "contain" to handle high-resolution icons
          - Added base64-encoded images for iOS Safari "forward" button, PlayBook "save bookmark" icon, BlackBerry button icon.
          - Fixed layout issue with close button.
          - Moved location of bubble on PlayBook to match location of the "save bookmark" UI.
  1.1.0 : - Fork by okamototk
          - Support jQuery Mobile.
          - Internationalization and Japanese translation.
          - Optimize bubble icon size.
  1.1.1 : - Android 4.0 support.
  1.1.2 : - Android 4.0 Tablet / Mobile both support.
  1.1.3 : - Fork by wiifm
          - iOS7 support.

  ##########################

  Copyright 2010 Google Inc.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

/**
 * @fileoverview Bookmark bubble library. This is meant to be included in the
 * main JavaScript binary of a mobile web application.
 *
 * Supported browsers: iPhone / iPod / iPad Safari 3.0+
 */

var google = google || {};
google.bookmarkbubble = google.bookmarkbubble || {};


/**
 * Binds a context object to the function.
 * @param {Function} fn The function to bind to.
 * @param {Object} context The "this" object to use when the function is run.
 * @return {Function} A partially-applied form of fn.
 */
google.bind = function(fn, context) {
  return function() {
    return fn.apply(context, arguments);
  };
};


/**
 * Function used to define an abstract method in a base class. If a subclass
 * fails to override the abstract method, then an error will be thrown whenever
 * that method is invoked.
 */
google.abstractMethod = function() {
  throw Error('Unimplemented abstract method.');
};



/**
 * The bubble constructor. Instantiating an object does not cause anything to
 * be rendered yet, so if necessary you can set instance properties before
 * showing the bubble.
 * @constructor
 */
google.bookmarkbubble.Bubble = function() {
  /**
   * Handler for the scroll event. Keep a reference to it here, so it can be
   * unregistered when the bubble is destroyed.
   * @type {function()}
   * @private
   */
  this.boundScrollHandler_ = google.bind(this.setPosition, this);

  /**
   * The bubble element.
   * @type {Element}
   * @private
   */
  this.element_ = null;

  /**
   * Whether the bubble has been destroyed.
   * @type {boolean}
   * @private
   */
  this.hasBeenDestroyed_ = false;
};


/**
 * Shows the bubble if allowed. It is not allowed if:
 * - The browser is not Mobile Safari, or
 * - The user has dismissed it too often already, or
 * - The hash parameter is present in the location hash, or
 * - The application is in fullscreen mode, which means it was already loaded
 *   from a homescreen bookmark.
 * @return {boolean} True if the bubble is being shown, false if it is not
 *     allowed to show for one of the aforementioned reasons.
 */
google.bookmarkbubble.Bubble.prototype.showIfAllowed = function() {
  if (!this.isAllowedToShow_()) {
    return false;
  }

  this.show_();
  return true;
};


/**
 * Shows the bubble if allowed after loading the icon image. This method creates
 * an image element to load the image into the browser's cache before showing
 * the bubble to ensure that the image isn't blank. Use this instead of
 * showIfAllowed if the image url is http and cacheable.
 * This hack is necessary because Mobile Safari does not properly render
 * image elements with border-radius CSS.
 * @param {function()} opt_callback Closure to be called if and when the bubble
 *        actually shows.
 * @return {boolean} True if the bubble is allowed to show.
 */
google.bookmarkbubble.Bubble.prototype.showIfAllowedWhenLoaded =
    function(opt_callback) {
  if (!this.isAllowedToShow_()) {
    return false;
  }

  var self = this;
  // Attach to self to avoid garbage collection.
  var img = self.loadImg_ = document.createElement('img');
  img.src = self.getIconUrl_();
  img.onload = function() {
    if (img.complete) {
      delete self.loadImg_;
      img.onload = null;  // Break the circular reference.

      self.show_();
      opt_callback && opt_callback();
    }
  };
  img.onload();

  return true;
};


/**
 * Sets the parameter in the location hash. As it is
 * unpredictable what hash scheme is to be used, this method must be
 * implemented by the host application.
 *
 * This gets called automatically when the bubble is shown. The idea is that if
 * the user then creates a bookmark, we can later recognize on application
 * startup whether it was from a bookmark suggested with this bubble.
 *
 * NOTE: Using a hash parameter to track whether the bubble has been shown
 * conflicts with the navigation system in jQuery Mobile. If you are using that
 * library, you should implement this function to track the bubble's status in
 * a different way, e.g. using window.localStorage in HTML5.
 */
google.bookmarkbubble.Bubble.prototype.setHashParameter = google.abstractMethod;


/**
 * Whether the parameter is present in the location hash. As it is
 * unpredictable what hash scheme is to be used, this method must be
 * implemented by the host application.
 *
 * Call this method during application startup if you want to log whether the
 * application was loaded from a bookmark with the bookmark bubble promotion
 * parameter in it.
 *
 * @return {boolean} Whether the bookmark bubble parameter is present in the
 *     location hash.
 */
google.bookmarkbubble.Bubble.prototype.hasHashParameter = google.abstractMethod;

/**
 * The number of times the user must dismiss the bubble before we stop showing
 * it. This is a public property and can be changed by the host application if
 * necessary.
 * @type {number}
 */
google.bookmarkbubble.Bubble.prototype.NUMBER_OF_TIMES_TO_DISMISS = 2;


/**
 * Time in milliseconds. If the user does not dismiss the bubble, it will auto
 * destruct after this amount of time.
 * @type {number}
 */
google.bookmarkbubble.Bubble.prototype.TIME_UNTIL_AUTO_DESTRUCT = 15000;


/**
 * The prefix for keys in local storage. This is a public property and can be
 * changed by the host application if necessary.
 * @type {string}
 */
google.bookmarkbubble.Bubble.prototype.LOCAL_STORAGE_PREFIX = 'BOOKMARK_';


/**
 * The key name for the dismissed state.
 * @type {string}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.DISMISSED_ = 'DISMISSED_COUNT';


/**
 * The arrow image in base64 data url format.
 * @type {string}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.IMAGE_ARROW_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAZCAMAAAAYAM5SAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzozMjowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNSBNYWNpbnRvc2giIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NzJFNTUzOTVGM0Q5MTFFMDk1OUZGOTUxMzQxOTZBOTUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NzJFNTUzOTZGM0Q5MTFFMDk1OUZGOTUxMzQxOTZBOTUiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo3MkU1NTM5M0YzRDkxMUUwOTU5RkY5NTEzNDE5NkE5NSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo3MkU1NTM5NEYzRDkxMUUwOTU5RkY5NTEzNDE5NkE5NSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PmaTRQ0AAAAMUExURe7u7v////X19f///0GahZ4AAAAEdFJOU////wBAKqn0AAAAR0lEQVR42tzJyQEAIAgDMND9d/ZGWmEB843UTYsArWJF54rPFx0UHhYclT8ud0/de8suqHNR7QtrXVzzkhqXVb+0hl+rCTAAtw4F95zesBUAAAAASUVORK5CYII=';


/**
 * The close image in base64 data url format.
 * @type {string}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.IMAGE_CLOSE_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzozMjowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNSBNYWNpbnRvc2giIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NjhEMjhFOTJGMzI4MTFFMDk1OUZGOTUxMzQxOTZBOTUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NjhEMjhFOTNGMzI4MTFFMDk1OUZGOTUxMzQxOTZBOTUiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpERDM2MDFBNUYyMjkxMUUwOTU5RkY5NTEzNDE5NkE5NSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpERDM2MDFBNkYyMjkxMUUwOTU5RkY5NTEzNDE5NkE5NSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PjMAla0AAAAwUExURTMzM6ioqEpKSs3NzTo6OmpqakNDQ+Li4ioqKlpaWnZ2doeHh5qamlZWVlFRUeTk5IUDvwkAAAIJSURBVHja3JbZsoMgDIZZg6DA+7/tScIWtTOltyfYqQQ//oRN1fGjKaV+JRyoBW+ZM7khbtfARK+aGJg9K9GfmAwSeL9n0aeLwnNQSt6yiCKaUgIoWBGW19+9IcY0EJPjh/J2TYQCi5uREXKwyq+5OEKirdPseMTW0F3BL5WBZM8t7XfmTLpX96AldmSpUnK5WitTkRx+alQdM3kKI0dH0HSPoYZwUd2GwDWMNLaZzE/Et3T4QXzmGiKh+jX7PTDHC8bkxL0iE4IufkZVz7lg8lQhGaKu0S2OkKUAOTHbWulqyEGLDGW42DlqoStyImaUPAPrCK7t8LbUmhZydKTvh/MJVF3kfvGJEeXEDtP1jthiXkjPfzrtHfGPXUm5PBBz3mT0YyNLlVHiTQUXlwFRzECIYTMAbTpELrE1GG4tkdPniRn2GDFakSDM0HFxU4EP81JPibBKT6aZnb2LlOJCMLCrI51Zo2XzYqx7qKil4lc0SVTCKZGpwgfu6liDc1qENs7kgRyMgLvEKsFqESMN4LjAVMHInBORJKAuxIBf4+SfKiQjFpfuUYhR8x3JEtFz2i30PpNc0HeEkkmvHtGs2DZv5KO9/FAmopzidrUuJUHV3S77O/K9SBX2PB6Qt+OuLJX2hv7+Dpcqm6/9qXL8I0Rtf8Nk/rqQZ/I36yc/fSj4TcMXsv4TYADp7j2MNhJKiAAAAABJRU5ErkJggg==';


google.bookmarkbubble.Bubble.prototype.IMAGE_BLACKBERRY_ICON_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA7BpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzozMjowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wUmlnaHRzPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvcmlnaHRzLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcFJpZ2h0czpNYXJrZWQ9IkZhbHNlIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6Rjc3RjExNzQwNzIwNjgxMThGNjJERkQwMEY0QTI1MDUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6RjBCMkE0OTU4QkMwMTFFMEE4MDNEMUFBM0ZDREM1QjgiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6RjBCMkE0OTQ4QkMwMTFFMEE4MDNEMUFBM0ZDREM1QjgiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNSBXaW5kb3dzIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6MzJGOTcxODNCRDhCRTAxMUEwRTNGNjkyNUFDRkE2MTkiIHN0UmVmOmRvY3VtZW50SUQ9InV1aWQ6MTBCREIxMUNGRjVBRTAxMUJDRDJBNzcxMjgxOTJDMzgiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz55WxUmAAAB70lEQVR42sRTTaupURhdL07yUeSrzGTga2hgRilGkpmpCUoZGTP3A85A/oGZgYGBOkchUUpkIFK+opOI1EnYx7PvvW/OrTs6g/vU8+79rr33s9dae2+BMYafhAQ/DNlkMqGW1Wo1SCQSWK1WaLVaweFwsFKphMvlApPJhEAgQPOE8/kMYq1Wq/H+/g7kcjlK0iFmt9tlnU7nG5bNZtn1esVqtcJyucThcEC5XIas1Wp9o6TX66HT6VCpVERMKpXCYrHgd7HnEITtdov1es2Ox6Mo4fPzU3j02Xw+57OMRiMeGwkajYYlk0mOqVQqvL6+QkZV2+02brcb5HI5nE4nDAYDp/fx8cF393q9aDQafOF+vxfbxWIBGZmXSqVETqPRCPl8niUSCRArCiqaTqd5nzahdLvdiEajkPV6vYcQgdMn/cFgEOPxGOQ2YUqlEuFwmONms5ljxKpQKAj8HpAmMpJkDAYDbgwZ1u/3MRwOMZvNOEZSCacilPRfLBa5B8Kzrff7HfV6Hc1mk1P1eDzIZDKoVqvY7XbivOl0+usiPS9WKBTw+XyIRCJ4e3sT8c1mw0heLBbDy8sLbDYb4vH49wJ2u/1Pl5EHFKTf7/fzI/ubqXiV6eNyufD8qMjd0+nEzz8UCv1zMR/476/xS4ABAJ70zF1PPvhAAAAAAElFTkSuQmCC';


google.bookmarkbubble.Bubble.prototype.IMAGE_SAFARI_FORWARD_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAkCAYAAAD2IghRAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAgZJREFUeNrsl99HQ2EYx8/WRImyP2BELFGWJWIXxW4SdVOKSJFSiixdJyK66WKJXaQUkbopdR/RbpqNSCNKRCQ2IrpZ35fncGRnO++Pnc7JvnwutvOec74e3+d5z+uJRqOazfoAE+BS5iFezX75wQXYBLVuMq5rBVyBZrcZZ+oBaTDoNuNMjeAMxHmi4wTjuhbADWhxm3GmMEVn2G3GmRrACUiAOrNFPlAQePgzxzRg6yJkKMTxjhlq3hGQLWacVxnQV2ZNkDLLpkVAovrt4BbMg0OZqOTIdM7keoQmxAMZDyiKzgHYM0aH1/iaiWm9MtciM9miJqlx28yi4hHYAddltm8OBalAiz6Jh9SAHWoiO8Xe65cxHv8D0y9gDCRF53gMzNls+hx0MNOiGxCbxRsC97FZnBK47xssgSGQl5njiTKNmKKqJMnsPfgyXOfZ8J5oA0rJbkCjoLvI/3dgnzaJd0XROAXTxirLGI/9+s2OX6uCESgVjWWwXWoRj/GwodpvlLtjxQ34SNHIqPw61D81WRxaK2CaRaPTimle4wNgl07oeYWGWePOUqU/rd5kNSrs4+aVmkWlsrShZHhv9HJUpV+x6SPQZWK6yYknIFaEKTBuEo1emt+aqqmiSvUlrm3RtNKcaNxMaZ6jnZMOy6FKNKfjVDVut4o1Z6Fa8arxf2T8R4ABAMxNWkZtHiMqAAAAAElFTkSuQmCC';


google.bookmarkbubble.Bubble.prototype.IMAGE_IOS7_FORWARD_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAtCAMAAADm86mrAAABMlBMVEUAAAACbP/k8v4AWf+qzf1hpf0HdP8Cbv+21v0fhf2v0P282P0xkv200/1CnP0AbP8Ab/8Ae/+22P0Bd/8Aav8ReP58sv4OeP8BdP8HeP/u9v4Gb/8Abv/Y6/7R5v3V6v2hzf1apf1Gmv1Pov5Vof0Sef5Wo/2v1P0efv5Zpf2Ow/2y0/252P0Aaf+82/30+f71+f4EcP+52f2Dtv4Yfv8ef/76/P4AU/+szf2sz/2v0/35/P4JaP+/2v34+/6q0f1Wof0AXf+myv6t0P0AXP/k8f7y+P4vkP73+v7+//8Abf8AYf8AZv8AZf8AaP8KdP/////8/f+01P0Oef/z+f7T5/37/f/e7v71+v4AY/+y1P32+/6v0f34/P4BbP/9/v8AZ//3+/601f11rv0Ldf8AZP81S/JRAAAAAXRSTlMAQObYZgAAAP5JREFUeNrt0NlOwkAUgOEDAgIqKqs7Ki6AyuIGLmyuFFpAgdpapFO07/8KNCk0mQba4coL+l+ci5MvJ5OBye0dfgB5u5uNGLn+2lhbRwctQh3d8SwHfKtHhLe3Q+xSkPUzJ0S6drwFK7QI+/WEue5m4xKAFynjFJVN/+e93VFmD/0os9TomvFOFTQOr0CSxuF/+C0njOIeNK7thIyOX9OyGlN5HPNUbrTjL/hPnLdvLr/Vngtjns7fq6vzJH+G8+aV0dtFWXf979eIS/LA4nPH7/jiLPzpRZiFt97AjONZ3OJ4gp43w0ac1fOIkxKnRtmRG+eu+mJ/arbagkNlQ2Wzhs4sFDqpAAAAAElFTkSuQmCC';


google.bookmarkbubble.Bubble.prototype.IMAGE_PLAYBOOK_BOOKMARK_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADQAAAA0CAMAAADypuvZAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzozMjowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNSBNYWNpbnRvc2giIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NjhEMjhFOTZGMzI4MTFFMDk1OUZGOTUxMzQxOTZBOTUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NjhEMjhFOTdGMzI4MTFFMDk1OUZGOTUxMzQxOTZBOTUiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo2OEQyOEU5NEYzMjgxMUUwOTU5RkY5NTEzNDE5NkE5NSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo2OEQyOEU5NUYzMjgxMUUwOTU5RkY5NTEzNDE5NkE5NSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/Pmi5WPMAAAAwUExURb29vdPT08fHx5aWluTk5GlpaXx8fOzs7KysrPX19VZWVoiIiP39/WFhYaKiov///2c8oVAAAAAQdFJOU////////////////////wDgI10ZAAABEElEQVR42uzW0ZKDIAwF0CCRACH0//92rdVaBYHs085seSQeB66QER6/GPBF/wsFCOVkjLGJaCY9ggh6xJHVCCUKahEsdVCixEudkw6RLHWhz6fPo4ZgrYAO8VphFUJZK0V+zT3B9j7QIN4Qd9CU/XvY99LtMZmnEiHH9mCsLC/5pvGpvqdpviViboNAd2McNm5usFVjQ/O6VzfmU69HFBubp4HGgmc141A3OqfhhloYyTlsGkFw2RMMoHRN3aY+oiI96iOzB+D3QEwfbV/X0oO2hfo+Wt8vrxmQRuhw6Q5uX5FxtU5RoGfg+TifId+G/jFrr2dtOYu2g0iKq4OuHvqBTC6vTsjm+x/xJ9CPAAMAEPqQqkGB5zYAAAAASUVORK5CYII=';


google.bookmarkbubble.Bubble.prototype.IMAGE_ANDROID3_BOOKMARK_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAACMUlEQVRYR+2WzcdqURTGIxGJSEQiEpGIlGgUKY0SiWiURmnyJiLRIJESKY0S6R9d129TqnPq7HN6r1zuQxzb2ms961kfO5d8Ga4vx5d/m0C/3xd+n+AjBeLxuMRisU/iOy/BYrEQCCSTSZnP545JOFagUCjIcDiUwWAgfDuFIwLH4/FB+mg0Kpw5gSMCjUZDqtXqLV6tVpN6ve4kvrMeIOP9fn8LuNvtHDejbQUYu2w2a8g2k8mofrALUwJkN5vN5OfnR3q9niB5qVRSzeb3+2U6nRriMAk+n0/ZYMudbrerGhV7fK5WK8O9BwJk4HK5BInz+bzKtFwuS6vVUkRGo5Gs1+uXSW42GxXwSpq7KAOpSCSifD8vLoMCGAQCgYca25X12X673UooFDLdmqYlQDKv1yvj8fjT2Eo1fE0mE1NfL5uQmlFv5HQKegA1Kc0rvJ2Cy+Ui4XBYmHO7YE9w93Q6vb2qNYbsezpbF8ViUdLptJa5FgGUCAaDWg6xpeGsMr860yJAUzJOukilUtovpBaBdrttqw/omWazqcVXiwALiXF6Bmdm48V5Lpf7PQL86zkcDjeH1JeScM6P7/vnmG+2qQ4sFWCL8c/nCsrBbHc6HcPZvexMzrv5125CFlGlUpHlcqnmmnKcz2dDcqjCzmdaeC94B3SWmKUCNJTb7ZZEImH6Cj4z4VVEMY/Ho4hbwZIAI4XsdsEdnWVkScBu4Ht7s/f/2d9fJaBD/j+BryvwBySPr9aPfFVqAAAAAElFTkSuQmCC';


google.bookmarkbubble.Bubble.prototype.IMAGE_ANDROID4_MOBILE_BOOKMARK_DATA_URL_ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAABYSURBVFhH7ZRBCgAgDMOs//+zimdPpVCQ7AMrWTOtM6M4s7j7riYABORYIOnZXUcoTgCBOgHLguT7tgKgYfIE9RISwLIg2QErABomT4AFdQKWBXQAAl8R2B3oJR7LKvEUAAAAAElFTkSuQmCC';

/**
 * Popup message to create shortcut to Home.
 */
google.bookmarkbubble.Bubble.prototype.msg = {
  android:
    '<b>Install this app:</b><br /> 1) Add to Bookmarks,<br /> 2) Tap and Hold the bookmark,<br /> 3) Select "<b>Add Shortcut to Home</b>"',
  android3:
    '<b>Install this app:</b><br /> Tap <img src="'+ google.bookmarkbubble.Bubble.prototype.IMAGE_ANDROID3_BOOKMARK_DATA_URL_ +'" style="height: 1.5em;display: inline-block;padding:0;margin:0;" />,<br /> select "<b>Add to</b>" and then "<b>Home screen</b>"',
  android4:
    '<b>Install this app:</b><br /> 1) Tap <img src="'+ google.bookmarkbubble.Bubble.prototype.IMAGE_ANDROID4_MOBILE_BOOKMARK_DATA_URL_ +'" style="height: 1.5em;display: inline-block;padding:0;margin:0;" />,<br /> 2) Select "<b>Save to bookmarks</b>",<br /> 3) Select "<b>Add to</b>" and then "<b>Home</b>"',
  android41:
    '<b>Install this app:</b><br /> 1) Add to Bookmarks,<br /> 2) Tap and Hold the bookmark,<br /> 3) Select "<b>Add Shortcut</b>"',
  blackberry:
    '<b>Install this app:</b><br /> Tap <img src="'+ google.bookmarkbubble.Bubble.prototype.IMAGE_BLACKBERRY_ICON_DATA_URL_ +'" style="height: 1em;display: inline-block;padding:0;margin:0" />, select "<b>Add to Home Screen</b>"',
  playbook:
     '<b>Install this app:</b><br /> Tap <img src="'+ google.bookmarkbubble.Bubble.prototype.IMAGE_PLAYBOOK_BOOKMARK_DATA_URL_ +'" style="height: 1.5em;display: inline-block;padding:0;margin:0;" />, select  <br />"<b>Add to Home Screen</b>"',
  ios42orlater :
     '<b>Install this app</b>:<br /> Tap <img src="'+ google.bookmarkbubble.Bubble.prototype.IMAGE_SAFARI_FORWARD_DATA_URL_ +'" style="height: 1em;display: inline-block;padding: 0;margin: 0" /> and then <b>"Add to Home Screen"</b>',
  ios7orlater :
     '<b>Install this app</b>:<br /> Tap <img src="'+ google.bookmarkbubble.Bubble.prototype.IMAGE_IOS7_FORWARD_DATA_URL_ +'" style="height: 2em;display: inline-block;padding: 0;margin: 0" /> and then <b>"Add to Home Screen"</b>',
  ioslegacy: '<b>Install this app</b>:<br /> Tap <b style="font-size:15px">+</b> and then <b>"Add to Home Screen"</b>'
};


/**
 * The link used to locate the application's home screen icon to display inside
 * the bubble. The default link used here is for an iPhone home screen icon
 * without gloss. If your application uses a glossy icon, change this to
 * 'apple-touch-icon'.
 * @type {string}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.REL_ICON_ =
    'apple-touch-icon-precomposed';


/**
 * Regular expression for detecting an iPhone or iPod or iPad.
 * @type {!RegExp}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.MOBILE_SAFARI_USERAGENT_REGEX_ =
    /iPhone|iPod|iPad|Android|BlackBerry|PlayBook/;


/**
 * Regular expression for detecting an iPad.
 * @type {!RegExp}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.IPAD_USERAGENT_REGEX_ = /iPad/;

/**
* additional stuffs for Android, BlackBerry
*/
google.bookmarkbubble.Bubble.prototype.ANDROID_USERAGENT_REGEX_ = /Android/;
google.bookmarkbubble.Bubble.prototype.BLACKBERRY_USERAGENT_REGEX_ = /BlackBerry/;
google.bookmarkbubble.Bubble.prototype.PLAYBOOK_USERAGENT_REGEX_ = /PlayBook/;

/**
 * Regular expression for extracting the iOS version. Only matches 2.0 and up.
 * @type {!RegExp}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.IOS_VERSION_USERAGENT_REGEX_ =
    /OS (\d)_(\d)(?:_(\d))?/;

/**
 * Regular expression for extracting the Android version.
 * @type {!RegExp}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.ANDROID_VERSION_USERAGENT_REGEX_ =
    /Android (\d)\.(\d)(?:\.(\d))?/;


/**
 * Determines whether the bubble should be shown or not.
 * @return {boolean} Whether the bubble should be shown or not.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.isAllowedToShow_ = function() {
  return this.isMobileSafari_() &&
      !this.hasBeenDismissedTooManyTimes_() &&
      !this.isFullscreen_() &&
      !this.hasHashParameter();
};


/**
 * Builds and shows the bubble.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.show_ = function() {
  this.element_ = this.build_();

  document.body.appendChild(this.element_);
  this.element_.style.WebkitTransform =
      'translate3d(0,' + this.getHiddenYPosition_() + 'px,0)';

  this.setHashParameter();

  window.setTimeout(this.boundScrollHandler_, 1);
  window.addEventListener('scroll', this.boundScrollHandler_, false);

  // If the user does not dismiss the bubble, slide out and destroy it after
  // some time.
  window.setTimeout(google.bind(this.autoDestruct_, this),
      this.TIME_UNTIL_AUTO_DESTRUCT);
};


/**
 * Destroys the bubble by removing its DOM nodes from the document.
 */
google.bookmarkbubble.Bubble.prototype.destroy = function() {
  if (this.hasBeenDestroyed_) {
    return;
  }
  window.removeEventListener('scroll', this.boundScrollHandler_, false);
  if (this.element_ && this.element_.parentNode == document.body) {
    document.body.removeChild(this.element_);
    this.element_ = null;
  }
  this.hasBeenDestroyed_ = true;
};


/**
 * Remember that the user has dismissed the bubble once more.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.rememberDismissal_ = function() {
  if (window.localStorage) {
    try {
      var key = this.LOCAL_STORAGE_PREFIX + this.DISMISSED_;
      var value = Number(window.localStorage[key]) || 0;
      window.localStorage[key] = String(value + 1);
    } catch (ex) {
      // Looks like we've hit the storage size limit. Currently we have no
      // fallback for this scenario, but we could use cookie storage instead.
      // This would increase the code bloat though.
    }
  }
};


/**
 * Whether the user has dismissed the bubble often enough that we will not
 * show it again.
 * @return {boolean} Whether the user has dismissed the bubble often enough
 *     that we will not show it again.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.hasBeenDismissedTooManyTimes_ =
    function() {
  if (!window.localStorage) {
    // If we can not use localStorage to remember how many times the user has
    // dismissed the bubble, assume he has dismissed it. Otherwise we might end
    // up showing it every time the host application loads, into eternity.
    return false;
  }
  try {
    var key = this.LOCAL_STORAGE_PREFIX + this.DISMISSED_;

    // If the key has never been set, localStorage yields undefined, which
    // Number() turns into NaN. In that case we'll fall back to zero for
    // clarity's sake.
    var value = Number(window.localStorage[key]) || 0;

    return value >= this.NUMBER_OF_TIMES_TO_DISMISS;
  } catch (ex) {
    // If we got here, something is wrong with the localStorage. Make the same
    // assumption as when it does not exist at all. Exceptions should only
    // occur when setting a value (due to storage limitations) but let's be
    // extra careful.
    return true;
  }
};


/**
 * Whether the application is running in fullscreen mode.
 * @return {boolean} Whether the application is running in fullscreen mode.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.isFullscreen_ = function() {
  return !!window.navigator.standalone;
};


/**
 * Whether the application is running inside Mobile Safari.
 * @return {boolean} True if the current user agent looks like Mobile Safari.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.isMobileSafari_ = function() {
  return this.MOBILE_SAFARI_USERAGENT_REGEX_.test(window.navigator.userAgent);
};


/**
 * Whether the application is running on an iPad.
 * @return {boolean} True if the current user agent looks like an iPad.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.isIpad_ = function() {
  return this.IPAD_USERAGENT_REGEX_.test(window.navigator.userAgent);
};

google.bookmarkbubble.Bubble.prototype.isAndroid_ = function() {
  return this.ANDROID_USERAGENT_REGEX_.test(window.navigator.userAgent);
};

google.bookmarkbubble.Bubble.prototype.isBlackBerry_ = function() {
  return this.BLACKBERRY_USERAGENT_REGEX_.test(window.navigator.userAgent);
};

google.bookmarkbubble.Bubble.prototype.isPlayBook_ = function() {
  return this.PLAYBOOK_USERAGENT_REGEX_.test(window.navigator.userAgent);
};


/**
 * Creates a version number from 4 integer pieces between 0 and 127 (inclusive).
 * @param {*=} opt_a The major version.
 * @param {*=} opt_b The minor version.
 * @param {*=} opt_c The revision number.
 * @param {*=} opt_d The build number.
 * @return {number} A representation of the version.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.getVersion_ = function(opt_a, opt_b,
    opt_c, opt_d) {
  // We want to allow implicit conversion of any type to number while avoiding
  // compiler warnings about the type.
  return /** @type {number} */ (opt_a) << 21 |
      /** @type {number} */ (opt_b) << 14 |
      /** @type {number} */ (opt_c) << 7 |
      /** @type {number} */ (opt_d);
};


/**
 * Gets the iOS version of the device. Only works for 2.0+.
 * @return {number} The iOS version.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.getIosVersion_ = function() {
  var groups = this.IOS_VERSION_USERAGENT_REGEX_.exec(
      window.navigator.userAgent) || [];
  groups.shift();
  return this.getVersion_.apply(this, groups);
};

/**
 * Gets the Android version of the device.
 * @return {number} The Android version.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.getAndroidVersion_ = function() {
  var groups = this.ANDROID_VERSION_USERAGENT_REGEX_.exec(
      window.navigator.userAgent) || [];
  groups.shift();
  return this.getVersion_.apply(this, groups);
};


google.bookmarkbubble.Bubble.prototype.isMobile_ = function() {
  return window.navigator.userAgent.indexOf("Mobile Safari") >= 0;
};

/**
 * Positions the bubble at the bottom of the viewport using an animated
 * transition.
 */
google.bookmarkbubble.Bubble.prototype.setPosition = function() {
  this.element_.style.WebkitTransition = '-webkit-transform 0.7s ease-out';
  this.element_.style.WebkitTransform =
      'translate3d(0,' + this.getVisibleYPosition_() + 'px,0)';
};


/**
 * Destroys the bubble by removing its DOM nodes from the document, and
 * remembers that it was dismissed.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.closeClickHandler_ = function() {
  this.destroy();
  this.rememberDismissal_();
};


/**
 * Gets called after a while if the user ignores the bubble.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.autoDestruct_ = function() {
  if (this.hasBeenDestroyed_) {
    return;
  }
  this.element_.style.WebkitTransition = '-webkit-transform 0.7s ease-in';
  this.element_.style.WebkitTransform =
      'translate3d(0,' + this.getHiddenYPosition_() + 'px,0)';
  window.setTimeout(google.bind(this.destroy, this), 700);
};


/**
 * Gets the y offset used to show the bubble (i.e., position it on-screen).
 * @return {number} The y offset.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.getVisibleYPosition_ = function() {
  return this.isIpad_() || this.isPlayBook_() || this.getAndroidVersion_() >= this.getVersion_(3, 0) ?
      window.pageYOffset + 17 :
      window.pageYOffset - this.element_.offsetHeight + window.innerHeight - 17;
};


/**
 * Gets the y offset used to hide the bubble (i.e., position it off-screen).
 * @return {number} The y offset.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.getHiddenYPosition_ = function() {
  return this.isIpad_() || this.isPlayBook_() || this.getAndroidVersion_() >= this.getVersion_(3, 0) ?
      window.pageYOffset - this.element_.offsetHeight :
      window.pageYOffset + window.innerHeight;
};


/**
 * The url of the app's bookmark icon.
 * @type {string|undefined}
 * @private
 */
google.bookmarkbubble.Bubble.prototype.iconUrl_;


/**
 * Scrapes the document for a link element that specifies an Apple favicon and
 * returns the icon url. Returns an empty data url if nothing can be found.
 * @return {string} A url string.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.getIconUrl_ = function() {
  if (!this.iconUrl_) {
    var link = this.getLink(this.REL_ICON_);
    if (!link || !(this.iconUrl_ = link.href)) {
      this.iconUrl_ = 'data:image/png;base64,';
    }
  }
  return this.iconUrl_;
};


/**
 * Gets the requested link tag if it exists.
 * @param {string} rel The rel attribute of the link tag to get.
 * @return {Element} The requested link tag or null.
 */
google.bookmarkbubble.Bubble.prototype.getLink = function(rel) {
  rel = rel.toLowerCase();
  var links = document.getElementsByTagName('link');
  for (var i = 0; i < links.length; ++i) {
    var currLink = /** @type {Element} */ (links[i]);
    if (currLink.getAttribute('rel').toLowerCase() == rel) {
      return currLink;
    }
  }
  return null;
};


/**
 * Creates the bubble and appends it to the document.
 * @return {Element} The bubble element.
 * @private
 */
google.bookmarkbubble.Bubble.prototype.build_ = function() {
  var bubble = document.createElement('div');
  var isIpad = this.isIpad_();
  var isAndroid = this.isAndroid_();
  var isPlayBook = this.isPlayBook_();
  var isBlackBerry = this.isBlackBerry_();


  bubble.style.position = 'absolute';
  bubble.style.zIndex = 100000;
  bubble.style.width = '100%';
  bubble.style.left = '0';
  bubble.style.top = '0';

  var bubbleInner = document.createElement('div');
  bubbleInner.style.position = 'relative';
  bubbleInner.style.width = '214px';
  if (this.getAndroidVersion_() >= this.getVersion_(3, 0)) {
    bubbleInner.style.margin = '0 0 0 ' +(window.innerWidth - 240) + 'px';
  } else {
    bubbleInner.style.margin = isIpad ? '0 0 0 82px' : '0 auto';
  }
  bubbleInner.style.border = '2px solid #fff';
  bubbleInner.style.padding = '1em 1.5em 1em 0.5em';
  bubbleInner.style.WebkitBorderRadius = '8px';
  bubbleInner.style.WebkitBoxShadow = '0 0 8px rgba(0, 0, 0, 0.7)';
  bubbleInner.style.WebkitBackgroundSize = '100% 8px';
  bubbleInner.style.backgroundColor = '#eee';
  bubbleInner.style.background = '#cddcf3 -webkit-gradient(linear, ' +
      'left bottom, left top, ' + isIpad || isPlayBook || this.getAndroidVersion_() >= this.getVersion_(3, 0) ?
          'from(#cddcf3), to(#b3caed)) no-repeat top' :
          'from(#b3caed), to(#cddcf3)) no-repeat bottom';
  bubbleInner.style.font = '0.75em sans-serif';
  bubble.appendChild(bubbleInner);

  // The "Add to Home Screen" text is intended to be the exact same text
  // that is displayed in the menu of Android / Mobile Safari.
  if (isAndroid) {
    bubbleInner.style.font = '0.625em sans-serif';
    if (this.getAndroidVersion_() < this.getVersion_(3, 0)) {
      bubbleInner.innerHTML = this.msg.android;
    }
    else {
      if ((this.getAndroidVersion_() < this.getVersion_(4, 0)) && this.isMobile_()) {
        bubbleInner.innerHTML = this.msg.android3;
      }
      else {
        if ((this.getAndroidVersion_() < this.getVersion_(4, 1)) && this.isMobile_()) {
          bubbleInner.innerHTML = this.msg.android4;
        }
        else {
          bubbleInner.innerHTML = this.msg.android41;
        }
      }
    }
  }
  else if (isBlackBerry) {
    bubbleInner.innerHTML = this.msg.blackberry;
  }
  else if(isPlayBook) {
    bubbleInner.innerHTML = this.msg.playbook;
    bubbleInner.style.position = 'absolute';
    bubbleInner.style.right = '0px';
  }
  else {
    if (this.getIosVersion_() >= this.getVersion_(7, 0)) {
      bubbleInner.innerHTML = this.msg.ios7orlater;
    }
    else if (this.getIosVersion_() >= this.getVersion_(4, 2)) {
      bubbleInner.innerHTML = this.msg.ios42orlater;
    }
    else {
      bubbleInner.innerHTML = this.msg.ioslegacy;
    }
  }

  var icon = document.createElement('div');
  icon.style['float'] = 'left';
  icon.style.width = '55px';
  icon.style.height = '55px';
  icon.style.margin = '-2px 7px 3px 5px';
  icon.style.background =
      '#fff url(' + this.getIconUrl_() + ') no-repeat 0 0';
  icon.style.WebkitBackgroundSize = 'contain';
  icon.style.WebkitBorderRadius = '10px';
  icon.style.WebkitBoxShadow = '0 2px 5px rgba(0, 0, 0, 0.4)';
  bubbleInner.insertBefore(icon, bubbleInner.firstChild);

  var arrow = document.createElement('div');
  arrow.style.backgroundImage = 'url(' + this.IMAGE_ARROW_DATA_URL_ + ')';
  arrow.style.width = '25px';
  arrow.style.height = '19px';
  arrow.style.position = 'absolute';
  arrow.style.left = '111px';
  if (isIpad || isPlayBook) {
    arrow.style.WebkitTransform = 'rotate(180deg)';
    arrow.style.top = '-19px';
    arrow.style.left = '111px';
  } else if (this.getAndroidVersion_() >= this.getVersion_(3, 0)) {
    arrow.style.WebkitTransform = 'scale(1, -1)';
    arrow.style.top = '-19px';
    arrow.style.left = '180px';
  } else {
    arrow.style.bottom = '-19px';
    arrow.style.left = '111px';
  }
  bubbleInner.appendChild(arrow);

  var close = document.createElement('a');
  close.onclick = google.bind(this.closeClickHandler_, this);
  close.style.position = 'absolute';
  close.style.display = 'block';
  close.style.top = '-5px';
  close.style.right = '-5px';
  close.style.width = '16px';
  close.style.height = '16px';
  close.style.border = '10px solid transparent';
  close.style.background =
      'url(' + this.IMAGE_CLOSE_DATA_URL_ + ') no-repeat';
  close.style.WebkitBackgroundSize = "contain";
  bubbleInner.appendChild(close);

  return bubble;
};
