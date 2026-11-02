/* Concave project carousel — original vanilla implementation, no React Bits source or dependencies. */
(function () {
  'use strict';

  var trophySVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9a6 6 0 0 0 12 0V4H6v5Z" stroke="currentColor" stroke-width="1.8"/><path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3M9 21h6M12 15v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var clamp = function (value, min, max) { return Math.min(Math.max(value, min), max); };

  function createProjectCarousel(host, projects, options) {
    if (!host || !host.nodeType) throw new Error('createProjectCarousel requires a host element.');
    if (!Array.isArray(projects) || !projects.length) throw new Error('createProjectCarousel requires at least one project.');
    options = options || {};

    var items = projects.slice();
    var count = items.length;
    var current = clamp(Number(options.initialIndex) || 0, 0, count - 1);
    var position = current;
    var destroyed = false;
    var externalPaused = false;
    var userPaused = false;
    var hovering = false;
    var focusing = false;
    var dragging = false;
    var pointerStart = null;
    var dragStartPosition = 0;
    var moved = false;
    var velocity = 0;
    var lastDragSample = null;
    var wheelLock = false;
    var raf = 0;
    var lastFrame = 0;
    var settle = null;
    var detailsIndex = -1;
    var imageRatios = items.map(function (project) { return project.cat === 'hw' ? 4 / 3 : 1.85; });
    var resizeObserver = null;
    var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!(reducedQuery && reducedQuery.matches);
    var previousHTML = host.innerHTML;
    var previousClass = host.className;

    host.classList.add('project-carousel-host');
    host.innerHTML = '';

    var root = document.createElement('section');
    root.className = 'project-carousel' + (reduced ? ' is-reduced' : '');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', options.label || 'Project carousel');
    root.tabIndex = 0;

    // Show every winner up front, independently of the image currently in view.
    var awards = document.createElement('section');
    awards.className = 'project-carousel-awards';
    awards.setAttribute('aria-label', 'Hackathon-winning projects');
    var awardHeading = document.createElement('h3');
    var winners = items.map(function (project, index) { return { project:project, index:index }; })
      .filter(function (entry) { return entry.project.win; });
    awardHeading.innerHTML = trophySVG + '<span>Hackathon winners</span>';
    var awardCount = document.createElement('span');
    awardCount.className = 'project-carousel-award-count';
    awardCount.textContent = String(winners.length);
    awardHeading.appendChild(awardCount);
    awards.appendChild(awardHeading);
    var winnerButtons = [];
    if (winners.length) {
      var awardList = document.createElement('ul');
      winners.forEach(function (entry) {
        var item = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'project-carousel-winner';
        button.dataset.winnerIndex = String(entry.index);
        button.textContent = entry.project.title.split(':')[0];
        button.setAttribute('aria-label', 'Show hackathon winner: ' + entry.project.title);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', function () { moveTo(entry.index, false); });
        winnerButtons.push(button);
        item.appendChild(button); awardList.appendChild(item);
      });
      awards.appendChild(awardList);
    } else {
      var noWins = document.createElement('p');
      noWins.textContent = 'No hackathon wins tagged in this category.';
      awards.appendChild(noWins);
    }
    root.appendChild(awards);

    var stage = document.createElement('div');
    stage.className = 'project-carousel-stage';
    stage.setAttribute('aria-label', 'Project gallery. Use left and right arrow keys to browse.');
    root.appendChild(stage);

    var cards = items.map(function (project, index) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'project-carousel-card';
      card.dataset.index = String(index);
      card.dataset.projectIndex = String(Number.isInteger(project.originalIndex) ? project.originalIndex : index);
      card.setAttribute('aria-label', 'Open project: ' + (project.title || ('Project ' + (index + 1))));
      stage.appendChild(card);
      return card;
    });

    var details = document.createElement('div');
    details.className = 'project-carousel-details';
    var meta = document.createElement('span');
    meta.className = 'project-carousel-meta';
    var titleLine = document.createElement('div');
    titleLine.className = 'project-carousel-titleline';
    var title = document.createElement('h3');
    title.className = 'project-carousel-title';
    var summary = document.createElement('p');
    summary.className = 'project-carousel-summary';
    titleLine.appendChild(title);
    details.appendChild(meta);
    details.appendChild(titleLine);
    details.appendChild(summary);
    root.appendChild(details);

    var controls = document.createElement('div');
    controls.className = 'project-carousel-controls';
    var previous = document.createElement('button');
    previous.type = 'button'; previous.className = 'project-carousel-control'; previous.setAttribute('aria-label', 'Previous project'); previous.textContent = '←';
    var counter = document.createElement('span');
    counter.className = 'project-carousel-counter';
    var next = document.createElement('button');
    next.type = 'button'; next.className = 'project-carousel-control'; next.setAttribute('aria-label', 'Next project'); next.textContent = '→';
    var open = document.createElement('button');
    open.type = 'button'; open.className = 'project-carousel-open'; open.dataset.carouselOpen = ''; open.textContent = 'Open project';
    controls.appendChild(previous); controls.appendChild(counter); controls.appendChild(next); controls.appendChild(open);
    root.appendChild(controls);
    host.appendChild(root);

    function projectSummary(project) {
      if (project.summary) return project.summary;
      return String(project.desc || '').split(/(?<=[.!?])\s/)[0] || 'Open project';
    }

    function mediaElement(project, index) {
      var media = document.createElement('div');
      media.className = 'project-carousel-media';
      if (project.images && project.images.length) {
        var image = document.createElement('img');
        image.src = project.images[0]; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
        var fitImage = function () {
          if (destroyed || !image.naturalWidth || !image.naturalHeight) return;
          imageRatios[index] = image.naturalWidth / image.naturalHeight;
          render();
        };
        image.addEventListener('load', fitImage, { once:true });
        if (image.complete) fitImage();
        media.appendChild(image);
      } else if (project.video) {
        var video = document.createElement('video');
        video.src = (typeof project.video === 'string' ? project.video : project.video.src) + '#t=0.1';
        video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-hidden', 'true');
        video.addEventListener('loadedmetadata', function () {
          if (destroyed || !video.videoWidth || !video.videoHeight) return;
          imageRatios[index] = video.videoWidth / video.videoHeight;
          render();
        }, { once:true });
        media.appendChild(video);
      } else {
        var fallback = document.createElement('div');
        fallback.className = 'project-carousel-fallback';
        fallback.innerHTML = '<svg viewBox="0 0 36 36" aria-hidden="true">' + (project.icon || '') + '</svg>';
        media.appendChild(fallback);
      }
      return media;
    }

    cards.forEach(function (card, index) { card.appendChild(mediaElement(items[index], index)); });

    function wrap(value) { return ((value % count) + count) % count; }
    function roundedPosition() { return wrap(Math.round(position)); }
    function shortestOffset(index, centre) {
      var offset = (index - centre) % count;
      if (offset > count / 2) offset -= count;
      if (offset < -count / 2) offset += count;
      return offset;
    }
    function stageWidth() { return host.clientWidth || root.clientWidth || window.innerWidth || 1024; }
    // Allow for projected width and the larger flanking cards, not just flat image width.
    function panelStep() { return window.innerWidth <= 700 ? 270 : 352; }
    function thetaFor(offset) { return offset * 0.25; }
    function activeProject() { return items[roundedPosition()]; }

    function updateDetails() {
      var activeIndex = roundedPosition();
      if (activeIndex === detailsIndex) return;
      detailsIndex = activeIndex;
      var project = items[activeIndex];
      winnerButtons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.winnerIndex) === activeIndex));
      });
      meta.textContent = String(activeIndex + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0');
      title.textContent = project.title || 'Untitled project';
      summary.textContent = projectSummary(project);
      var existingBadge = titleLine.querySelector('.project-carousel-win');
      if (existingBadge) existingBadge.remove();
      if (project.win) {
        var badge = document.createElement('span');
        badge.className = 'project-carousel-win';
        badge.innerHTML = trophySVG + '<span>Hackathon win</span>';
        titleLine.appendChild(badge);
      }
      counter.textContent = String(activeIndex + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0');
      open.setAttribute('aria-label', 'Open ' + (project.title || 'project'));
    }

    function render() {
      var centred = roundedPosition();
      var step = panelStep();
      var mobile = window.innerWidth <= 700;
      var maxWidth = mobile ? 225 : 310;
      var maxHeight = mobile ? 184 : 230;
      var tallest = 0;
      var perspective = mobile ? 850 : 1200;
      var gap = mobile ? 28 : 40;
      var layout = [];
      cards.forEach(function (card, index) {
        var ratio = imageRatios[index];
        var width = Math.min(maxWidth, maxHeight * ratio);
        var height = width / ratio;
        tallest = Math.max(tallest, height);
        card.style.width = width.toFixed(2) + 'px';
        card.style.height = height.toFixed(2) + 'px';
        card.style.marginLeft = (-width / 2).toFixed(2) + 'px';
        var offset = shortestOffset(index, position);
        var visible = Math.abs(offset) <= 2.35;
        var theta = thetaFor(offset);
        var radius = step / Math.sin(0.25);
        var x = radius * Math.sin(theta);
        var z = radius * (1 - Math.cos(theta)) - 24;
        var scale = 0.95 + Math.min(Math.abs(offset), 2) * 0.095;
        if (visible) {
          // Project each edge through the stage perspective. Its screen position
          // is a * x + b, so neighboring frames can share an exact visible gap.
          var half = width * scale / 2;
          var leftA = perspective / (perspective - z + half * Math.sin(theta));
          var rightA = perspective / (perspective - z - half * Math.sin(theta));
          layout.push({ card:card, index:index, offset:offset, theta:theta, z:z, scale:scale,
            la:leftA, lb:-half * Math.cos(theta) * leftA,
            ra:rightA, rb:half * Math.cos(theta) * rightA, x:x });
        }
        var fade = 1 - Math.max(0, Math.abs(offset) - 1.1) * 0.31;
        card.style.transform = 'translate3d(' + x.toFixed(2) + 'px,-50%,' + z.toFixed(2) + 'px) rotateY(' + (-theta).toFixed(3) + 'rad) scale(' + scale.toFixed(3) + ')';
        card.style.opacity = visible ? String(clamp(fade, 0, 1)) : '0';
        card.style.pointerEvents = visible ? 'auto' : 'none';
        card.style.zIndex = String(20 - Math.round(Math.abs(offset) * 5));
        var isCurrent = index === centred;
        card.classList.toggle('is-current', isCurrent);
        card.tabIndex = isCurrent ? 0 : -1;
        card.setAttribute('aria-hidden', isCurrent ? 'false' : 'true');
      });
      layout.sort(function (a, b) { return a.offset - b.offset; });
      var anchor = layout.findIndex(function (entry) { return entry.index === wrap(Math.floor(position)); });
      if (anchor >= 0) {
        var first = layout[anchor];
        var following = layout[anchor + 1];
        var fraction = position - Math.floor(position);
        var centreA = (first.la + first.ra) / 2;
        var centreB = (first.lb + first.rb) / 2;
        if (following) {
          var k = first.ra / following.la;
          var c = (first.rb + gap - following.lb) / following.la;
          var nextCentreA = (following.la + following.ra) / 2;
          var nextCentreB = (following.lb + following.rb) / 2;
          first.x = -((1 - fraction) * centreB + fraction * (nextCentreA * c + nextCentreB)) /
            ((1 - fraction) * centreA + fraction * nextCentreA * k);
        } else { first.x = -centreB / centreA; }
        for (var right = anchor + 1; right < layout.length; right++) {
          var before = layout[right - 1];
          var entry = layout[right];
          entry.x = (before.ra * before.x + before.rb + gap - entry.lb) / entry.la;
        }
        for (var left = anchor - 1; left >= 0; left--) {
          var after = layout[left + 1];
          var entry = layout[left];
          entry.x = (after.la * after.x + after.lb - gap - entry.rb) / entry.ra;
        }
        layout.forEach(function (entry) {
          entry.card.style.transform = 'translate3d(' + entry.x.toFixed(4) + 'px,-50%,' + entry.z.toFixed(4) +
            'px) rotateY(' + (-entry.theta).toFixed(6) + 'rad) scale(' + entry.scale.toFixed(6) + ')';
        });
      }
      stage.style.height = Math.ceil(tallest * 1.45 + 20) + 'px';
      updateDetails();
    }

    function cancelFrame() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function isPaused() { return externalPaused || userPaused; }
    function canDrift() { return !reduced && !isPaused() && !hovering && !focusing && !dragging && !document.hidden; }
    function needsFrame() { return !destroyed && (settle || canDrift()); }
    function schedule() { if (!raf && needsFrame()) raf = requestAnimationFrame(frame); }
    function frame(now) {
      raf = 0;
      if (destroyed) return;
      var delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
      lastFrame = now;
      if (settle) {
        var elapsed = now - settle.start;
        var progress = clamp(elapsed / settle.duration, 0, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        position = settle.from + (settle.to - settle.from) * eased;
        if (progress === 1) { position = wrap(settle.to); settle = null; }
        render();
      } else if (canDrift()) {
        position = wrap(position + delta * 0.16);
        render();
      }
      if (needsFrame()) schedule();
    }

    function moveTo(index, immediate) {
      var target = wrap(index);
      var from = position;
      var delta = shortestOffset(target, from);
      if (immediate || reduced || isPaused()) {
        settle = null; position = wrap(from + delta); render(); return;
      }
      settle = { from: from, to: from + delta, start: performance.now(), duration: 300 };
      schedule();
    }
    function nextProject(amount) { moveTo(roundedPosition() + amount, false); }
    function selectCurrent() { if (typeof options.onSelect === 'function') options.onSelect(activeProject()); }
    function setHover(value) { hovering = value; if (!value) schedule(); else if (!settle) cancelFrame(); }

    function onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      pointerStart = { x:event.clientX, y:event.clientY, time:performance.now() };
      dragStartPosition = position; moved = false; velocity = 0; lastDragSample = pointerStart; settle = null;
    }
    function onPointerMove(event) {
      if (!pointerStart) return;
      var dx = event.clientX - pointerStart.x;
      var dy = event.clientY - pointerStart.y;
      if (!moved && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { pointerStart = null; return; }
      if (!dragging && Math.abs(dx) > 5) {
        moved = true; dragging = true; root.classList.add('is-dragging');
        stage.setPointerCapture && stage.setPointerCapture(event.pointerId);
      }
      if (!dragging) return;
      event.preventDefault();
      position = dragStartPosition - dx / panelStep();
      var now = performance.now();
      var dt = Math.max(1, now - lastDragSample.time);
      velocity = -((event.clientX - lastDragSample.x) / panelStep()) / (dt / 1000);
      lastDragSample = { x:event.clientX, time:now };
      render();
    }
    function onPointerUp(event) {
      if (!pointerStart && !dragging) return;
      if (stage.hasPointerCapture && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      if (dragging) {
        var target = Math.round(position + clamp(velocity * 0.18, -1.2, 1.2));
        dragging = false; root.classList.remove('is-dragging');
        moveTo(target, false);
      }
      pointerStart = null;
      schedule();
    }
    function onWheel(event) {
      if (Math.abs(event.deltaY) < 4 && Math.abs(event.deltaX) < 4) return;
      event.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      nextProject((event.deltaY || event.deltaX) > 0 ? 1 : -1);
      window.setTimeout(function () { wheelLock = false; }, 220);
    }
    function onKeyDown(event) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); nextProject(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); nextProject(1); }
      else if (event.key === 'Home') { event.preventDefault(); moveTo(0, false); }
      else if (event.key === 'End') { event.preventDefault(); moveTo(count - 1, false); }
      else if (event.key === ' ' && document.activeElement === root) {
        event.preventDefault();
        userPaused = !userPaused;
        if (userPaused) { settle = null; cancelFrame(); } else { lastFrame = 0; schedule(); }
      }
      else if (event.key === 'Enter' && document.activeElement === root) { event.preventDefault(); selectCurrent(); }
    }
    function onCardClick(event) {
      if (moved && event.detail !== 0) { moved = false; return; }
      moved = false;
      var index = Number(event.currentTarget.dataset.index);
      moveTo(index, true);
      selectCurrent();
    }
    function onVisibility() { if (document.hidden) cancelFrame(); else { lastFrame = 0; schedule(); } }
    function onReducedChange(event) { reduced = event.matches; root.classList.toggle('is-reduced', reduced); settle = null; render(); if (reduced) cancelFrame(); else schedule(); }

    cards.forEach(function (card) { card.addEventListener('click', onCardClick); });
    previous.addEventListener('click', function () { nextProject(-1); });
    next.addEventListener('click', function () { nextProject(1); });
    open.addEventListener('click', selectCurrent);
    root.addEventListener('pointerenter', function () { setHover(true); });
    root.addEventListener('pointerleave', function () { setHover(false); });
    root.addEventListener('focusin', function () { focusing = true; cancelFrame(); });
    root.addEventListener('focusout', function () { window.setTimeout(function () { focusing = root.contains(document.activeElement); if (!focusing) schedule(); }, 0); });
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('wheel', onWheel, { passive:false });
    root.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    if (reducedQuery) {
      if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReducedChange);
      else if (reducedQuery.addListener) reducedQuery.addListener(onReducedChange);
    }
    if (window.ResizeObserver) { resizeObserver = new ResizeObserver(render); resizeObserver.observe(host); }
    else window.addEventListener('resize', render);

    var api = {
      destroy: function () {
        if (destroyed) return;
        destroyed = true; cancelFrame();
        cards.forEach(function (card) { card.removeEventListener('click', onCardClick); });
        stage.removeEventListener('pointerdown', onPointerDown); stage.removeEventListener('pointermove', onPointerMove);
        stage.removeEventListener('pointerup', onPointerUp); stage.removeEventListener('pointercancel', onPointerUp);
        stage.removeEventListener('wheel', onWheel); root.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('visibilitychange', onVisibility);
        if (reducedQuery) {
          if (reducedQuery.removeEventListener) reducedQuery.removeEventListener('change', onReducedChange);
          else if (reducedQuery.removeListener) reducedQuery.removeListener(onReducedChange);
        }
        if (resizeObserver) resizeObserver.disconnect(); else window.removeEventListener('resize', render);
        host.innerHTML = previousHTML; host.className = previousClass;
      },
      pause: function () { externalPaused = true; settle = null; cancelFrame(); },
      resume: function () { externalPaused = false; lastFrame = 0; schedule(); },
      goTo: function (index) { moveTo(Number(index) || 0, reduced); },
      getIndex: function () { return roundedPosition(); }
    };

    render();
    schedule();
    return api;
  }

  window.createProjectCarousel = createProjectCarousel;
}());
