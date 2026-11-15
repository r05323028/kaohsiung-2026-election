(() => {
  const results = {
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    largeLightElements: [],
    openShadowRoots: 0,
    points: [],
  };

  const parseAlpha = (color) => {
    const rgba = color.match(/rgba?\(([^)]+)\)/);
    if (!rgba) return color === 'transparent' ? 0 : 1;
    const parts = rgba[1].split(',').map((part) => Number(part.trim()));
    return parts.length === 4 ? parts[3] : 1;
  };

  const isLight = (color) => {
    const rgb = color.match(/rgba?\(([^)]+)\)/);
    if (!rgb) return false;
    const [r, g, b] = rgb[1].split(',').map((part) => Number(part.trim()));
    return (r + g + b) / 3 > 190 && parseAlpha(color) > 0.15;
  };

  const describe = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      className: typeof element.className === 'string' ? element.className : null,
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      background: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      borderRadius: style.borderRadius,
      opacity: style.opacity,
      zIndex: style.zIndex,
      position: style.position,
      pointerEvents: style.pointerEvents,
    };
  };

  const scan = (root) => {
    for (const element of root.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        const style = getComputedStyle(element);
        if (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          (isLight(style.backgroundColor) || style.backgroundImage !== 'none')
        ) {
          const entry = describe(element);
          if (entry.backgroundImage === 'none' || isLight(style.backgroundColor)) {
            results.largeLightElements.push(entry);
          }
        }
      }
      if (element.shadowRoot) {
        results.openShadowRoots += 1;
        scan(element.shadowRoot);
      }
    }
  };

  scan(document);

  for (let row = 1; row <= 5; row += 1) {
    for (let column = 1; column <= 7; column += 1) {
      const x = Math.round((innerWidth * column) / 8);
      const y = Math.round((innerHeight * row) / 6);
      results.points.push({
        x,
        y,
        stack: document.elementsFromPoint(x, y).slice(0, 10).map(describe),
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
  console.table(results.largeLightElements);
  return results;
})();
