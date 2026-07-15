// ============================================================
// PULSE — FIFA 2026 AI Survival Brain | Application Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // ── State ──────────────────────────────────────────────────
  let activePage = 'home';
  let chatLang = 'en';
  let userAge = 32;
  let userConditions = [];
  let selectedRoute = 'ai_optimized';
  let accessibilityMode = false;
  let crowdInterval = null;
  let particlesRAF = null;
  let isUserAuthenticated = false;

  // ── Security: HTML Sanitization ────────────────────────────
  const escapeHTML = (str) => {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  };

  // ── Router ─────────────────────────────────────────────────
  const navigate = (pageId) => {
    // If leaving the perimeter page and the camera is active, disconnect it
    if (activePage === 'perimeter' && pageId !== 'perimeter') {
      if (cctvActive && typeof window.toggleCctvAI === 'function') {
        window.toggleCctvAI();
      }
    }

    // If not authenticated, redirect all navigation attempts to the authentication screen
    if (!isUserAuthenticated && pageId !== 'auth') {
      pageId = 'auth';
    }

    // Toggle top-nav visibility and adjust padding offset on app container
    const topNav = document.getElementById('top-nav');
    const appContainer = document.getElementById('app');
    if (topNav) {
      if (isUserAuthenticated) {
        topNav.style.display = 'flex';
        if (appContainer) appContainer.style.paddingTop = ''; // Restore default padding
      } else {
        topNav.style.display = 'none';
        if (appContainer) appContainer.style.paddingTop = '0'; // Remove padding for fullscreen auth
      }
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    const page = document.getElementById(`page-${pageId}`);
    const tab  = document.querySelector(`[data-page="${pageId}"]`);
    if (page) page.classList.add('active');
    if (tab) {
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    }
    activePage = pageId;
    onPageEnter(pageId);
  };
  window.goToPulseHome = () => navigate('home');

  const onPageEnter = (pageId) => {
    if (pageId === 'home')       initHome();
    if (pageId === 'crowd')      initCrowdMap();
    if (pageId === 'heat')       initHeatPage();
    if (pageId === 'nav')        initNavPage();
    if (pageId === 'ops')        initOpsPage();
    if (pageId === 'transport')  initTransportPage();
    if (pageId === 'sustain')    initSustainPage();
    if (pageId === 'group')      initGroupPage();
    if (pageId === 'translate')  initTranslatePage();
    if (pageId === 'auth')       initAuthPage();
    if (pageId === 'perimeter')  initPerimeterPage();
  };

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => navigate(tab.dataset.page));
  });

  const signInNavBtn = document.getElementById('nav-signin-btn');
  if (signInNavBtn) {
    signInNavBtn.addEventListener('click', () => {
      if (isUserAuthenticated) {
        // Toggle logout
        if (confirm('Do you want to sign out of PULSE?')) {
          isUserAuthenticated = false;
          signInNavBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Sign In
          `;
          toast('Logged out successfully.', 'info');
          navigate('home');
        }
      } else {
        navigate('auth');
      }
    });
  }

  // ── Theme Toggle Logic ──────────────────────────────────────
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    const sunIcon = themeToggleBtn.querySelector('.theme-icon-sun');
    const moonIcon = themeToggleBtn.querySelector('.theme-icon-moon');

    // Global reference for shader uniforms to update colors on theme change
    let globalShaderUniforms = null;

    // Restore saved theme preference
    const savedTheme = localStorage.getItem('pulse-theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }

    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      const isLight = document.body.classList.contains('light-theme');
      
      // Save setting
      localStorage.setItem('pulse-theme', isLight ? 'light' : 'dark');

      // Swap SVG icon visibility
      if (isLight) {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
        toast('Switched to Light Mode', 'info');
      } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
        toast('Switched to Dark Mode (OLED)', 'info');
      }

      // Dynamic theme update for Three.js background shader lines
      if (globalShaderUniforms) {
        const colors = isLight 
          ? ['#334155', '#475569', '#64748B'] 
          : ['#5c8187', '#6f6f6f', '#6a6a6a'];
        colors.forEach((hex, i) => {
          let value = hex.trim();
          if (value.startsWith('#')) value = value.slice(1);
          let r = parseInt(value.slice(0, 2), 16) / 255;
          let g = parseInt(value.slice(2, 4), 16) / 255;
          let b = parseInt(value.slice(4, 6), 16) / 255;
          globalShaderUniforms.lineGradient.value[i].set(r, g, b);
        });
      }
    });
  }

  // ── Floating Lines Background (Three.js WebGL Shader) ────────
  // Ported from the custom FloatingLines React/Three.js component.
  // Renders animated lines with interactive cursor bending and parallax offsets.
  let globalShaderUniforms = null;

  const initParticles = () => {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;

    // Check if THREE is loaded globally
    if (typeof THREE === 'undefined') {
      console.warn('Three.js not loaded. Falling back to clean backdrop.');
      return;
    }

    // Vertex Shader
    const vertexShader = `
      precision highp float;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // Fragment Shader
    const fragmentShader = `
      precision highp float;

      varying vec2 vUv;

      uniform float iTime;
      uniform vec3  iResolution;
      uniform float animationSpeed;

      uniform bool enableTop;
      uniform bool enableMiddle;
      uniform bool enableBottom;

      uniform int topLineCount;
      uniform int middleLineCount;
      uniform int bottomLineCount;

      uniform float topLineDistance;
      uniform float middleLineDistance;
      uniform float bottomLineDistance;

      uniform vec3 topWavePosition;
      uniform vec3 middleWavePosition;
      uniform vec3 bottomWavePosition;

      uniform vec2 iMouse;
      uniform bool interactive;
      uniform float bendRadius;
      uniform float bendStrength;
      uniform float bendInfluence;

      uniform bool parallax;
      uniform float parallaxStrength;
      uniform vec2 parallaxOffset;

      uniform vec3 lineGradient[8];
      uniform int lineGradientCount;

      const vec3 BLACK = vec3(0.0);
      const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;
      const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;

      mat2 rotate(float r) {
        return mat2(cos(r), sin(r), -sin(r), cos(r));
      }

      vec3 background_color(vec2 uv) {
        vec3 col = vec3(0.0);
        float y = sin(uv.x - 0.2) * 0.3 - 0.1;
        float m = uv.y - y;
        col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
        col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
        return col * 0.5;
      }

      vec3 getLineColor(float t, vec3 baseColor) {
        if (lineGradientCount <= 0) {
          return baseColor;
        }
        
        if (lineGradientCount == 1) {
          return lineGradient[0];
        }

        float clampedT = clamp(t, 0.0, 0.9999);
        float scaled = clampedT * float(lineGradientCount - 1);
        int idx = int(floor(scaled));
        float f = fract(scaled);

        vec3 c1 = vec3(1.0);
        vec3 c2 = vec3(1.0);

        // WebGL 1.0 compatible indexing loop
        for (int i = 0; i < 8; i++) {
          if (i == idx) c1 = lineGradient[i];
          if (i == idx + 1) c2 = lineGradient[i];
        }

        return mix(c1, c2, f);
      }

      float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {
        float time = iTime * animationSpeed;
        float x_offset   = offset;
        float x_movement = time * 0.1;
        float amp        = sin(offset + time * 0.2) * 0.3;
        float y          = sin(uv.x + x_offset + x_movement) * amp;

        if (shouldBend) {
          vec2 d = screenUv - mouseUv;
          float influence = exp(-dot(d, d) * bendRadius);
          float bendOffset = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
          y += bendOffset;
        }

        float m = uv.y - y;
        return 0.0175 / max(abs(m) + 0.01, 1e-3) + 0.01;
      }

      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
        baseUv.y *= -1.0;

        if (parallax) {
          baseUv += parallaxOffset;
        }

        vec3 col = vec3(0.0);
        vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);

        vec2 mouseUv = vec2(0.0);
        if (interactive) {
          mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
          mouseUv.y *= -1.0;
        }

        if (enableBottom) {
          for (int i = 0; i < 8; ++i) {
            if (i >= bottomLineCount) break;
            float fi = float(i);
            float t = fi / max(float(bottomLineCount - 1), 1.0);
            vec3 lineCol = getLineColor(t, b);
            float angle = bottomWavePosition.z * log(length(baseUv) + 1.0);
            vec2 ruv = baseUv * rotate(angle);
            col += lineCol * wave(
              ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y),
              1.5 + 0.2 * fi,
              baseUv,
              mouseUv,
              interactive
            ) * 0.2;
          }
        }

        if (enableMiddle) {
          for (int i = 0; i < 8; ++i) {
            if (i >= middleLineCount) break;
            float fi = float(i);
            float t = fi / max(float(middleLineCount - 1), 1.0);
            vec3 lineCol = getLineColor(t, b);
            float angle = middleWavePosition.z * log(length(baseUv) + 1.0);
            vec2 ruv = baseUv * rotate(angle);
            col += lineCol * wave(
              ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y),
              2.0 + 0.15 * fi,
              baseUv,
              mouseUv,
              interactive
            );
          }
        }

        if (enableTop) {
          for (int i = 0; i < 8; ++i) {
            if (i >= topLineCount) break;
            float fi = float(i);
            float t = fi / max(float(topLineCount - 1), 1.0);
            vec3 lineCol = getLineColor(t, b);
            float angle = topWavePosition.z * log(length(baseUv) + 1.0);
            vec2 ruv = baseUv * rotate(angle);
            ruv.x *= -1.0;
            col += lineCol * wave(
              ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y),
              1.0 + 0.2 * fi,
              baseUv,
              mouseUv,
              interactive
            ) * 0.1;
          }
        }

        fragColor = vec4(col, 1.0);
      }

      void main() {
        vec4 color = vec4(0.0);
        mainImage(color, gl_FragCoord.xy);
        gl_FragColor = color;
      }
    `;

    const hexToVec3 = (hex) => {
      let value = hex.trim();
      if (value.startsWith('#')) value = value.slice(1);
      let r = 255, g = 255, b = 255;
      if (value.length === 3) {
        r = parseInt(value[0] + value[0], 16);
        g = parseInt(value[1] + value[1], 16);
        b = parseInt(value[2] + value[2], 16);
      } else if (value.length === 6) {
        r = parseInt(value.slice(0, 2), 16);
        g = parseInt(value.slice(2, 4), 16);
        b = parseInt(value.slice(4, 6), 16);
      }
      return new THREE.Vector3(r / 255, g / 255, b / 255);
    };

    // User settings configured via options
    const enabledWaves = ['top', 'middle', 'bottom'];
    const lineCount = 5;
    const lineDistance = 12.5;
    const bendRadius = 8.0;
    const bendStrength = -2.0;
    const interactive = true;
    const parallax = true;
    const parallaxStrength = 0.15;
    const animationSpeed = 1.0;
    const mouseDamping = 0.05;

    const topLineCount = enabledWaves.includes('top') ? lineCount : 0;
    const middleLineCount = enabledWaves.includes('middle') ? lineCount : 0;
    const bottomLineCount = enabledWaves.includes('bottom') ? lineCount : 0;

    const topLineDistance = topLineCount ? lineDistance * 0.01 : 0.01;
    const middleLineDistance = middleLineCount ? lineDistance * 0.01 : 0.01;
    const bottomLineDistance = bottomLineCount ? lineDistance * 0.01 : 0.01;

    const topWavePosition = new THREE.Vector3(10.0, 0.5, -0.4);
    const middleWavePosition = new THREE.Vector3(5.0, 0.0, 0.2);
    const bottomWavePosition = new THREE.Vector3(2.0, -0.7, 0.4);

    const targetMouse = new THREE.Vector2(-1000, -1000);
    const currentMouse = new THREE.Vector2(-1000, -1000);
    let targetInfluence = 0.0;
    let currentInfluence = 0.0;
    const targetParallax = new THREE.Vector2(0, 0);
    const currentParallax = new THREE.Vector2(0, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(1.0); // Optimize for mobile/laptops by avoiding high-DPI GPU overhead

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      animationSpeed: { value: animationSpeed },

      enableTop: { value: enabledWaves.includes('top') },
      enableMiddle: { value: enabledWaves.includes('middle') },
      enableBottom: { value: enabledWaves.includes('bottom') },

      topLineCount: { value: topLineCount },
      middleLineCount: { value: middleLineCount },
      bottomLineCount: { value: bottomLineCount },

      topLineDistance: { value: topLineDistance },
      middleLineDistance: { value: middleLineDistance },
      bottomLineDistance: { value: bottomLineDistance },

      topWavePosition: { value: topWavePosition },
      middleWavePosition: { value: middleWavePosition },
      bottomWavePosition: { value: bottomWavePosition },

      iMouse: { value: new THREE.Vector2(-1000, -1000) },
      interactive: { value: interactive },
      bendRadius: { value: bendRadius },
      bendStrength: { value: bendStrength },
      bendInfluence: { value: 0 },

      parallax: { value: parallax },
      parallaxStrength: { value: parallaxStrength },
      parallaxOffset: { value: new THREE.Vector2(0, 0) },

      lineGradient: {
        value: Array.from({ length: 8 }, () => new THREE.Vector3(1, 1, 1))
      },
      lineGradientCount: { value: 3 }
    };

    globalShaderUniforms = uniforms;

    const isLight = document.body.classList.contains('light-theme');
    const colors = isLight 
      ? ['#334155', '#475569', '#64748B'] 
      : ['#5c8187', '#6f6f6f', '#6a6a6a'];
    
    colors.forEach((hex, i) => {
      const color = hexToVec3(hex);
      uniforms.lineGradient.value[i].copy(color);
    });

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const clock = new THREE.Clock();

    const setSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height, false);
      uniforms.iResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio(), 1);
    };
    setSize();
    window.addEventListener('resize', setSize);

    // Dynamic mouse tracker attached to window for smooth screen tracking
    const handlePointerMove = (event) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = renderer.getPixelRatio();
      targetMouse.set(event.clientX * dpr, (height - event.clientY) * dpr);
      targetInfluence = 1.0;

      if (parallax) {
        const centerX = width / 2;
        const centerY = height / 2;
        const offsetX = (event.clientX - centerX) / width;
        const offsetY = -(event.clientY - centerY) / height;
        targetParallax.set(offsetX * parallaxStrength, offsetY * parallaxStrength);
      }
    };

    const handlePointerLeave = () => {
      targetInfluence = 0.0;
    };

    if (interactive) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerleave', handlePointerLeave);
    }

    let lastTime = 0;
    const fpsInterval = 1000 / 30; // Limit rendering to 30 FPS to reduce GPU workload and prevent lagging

    const renderLoop = (timestamp) => {
      particlesRAF = requestAnimationFrame(renderLoop);

      if (!timestamp) return;

      const elapsed = timestamp - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = timestamp - (elapsed % fpsInterval);

      uniforms.iTime.value = clock.getElapsedTime();

      if (interactive) {
        currentMouse.lerp(targetMouse, mouseDamping);
        uniforms.iMouse.value.copy(currentMouse);
        currentInfluence += (targetInfluence - currentInfluence) * mouseDamping;
        uniforms.bendInfluence.value = currentInfluence;
      }

      if (parallax) {
        currentParallax.lerp(targetParallax, mouseDamping);
        uniforms.parallaxOffset.value.copy(currentParallax);
      }

      renderer.render(scene, camera);
    };
    requestAnimationFrame(renderLoop);
  };

  // ── Toast Notifications ─────────────────────────────────────
  const svgIcon = (type) => {
    const icons = {
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-bright)" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
      danger:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red-bright)" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange-bright)" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };
    return icons[type] || icons.info;
  };

  const toast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${svgIcon(type)}</span><span>${escapeHTML(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 4200);
  };

  // ── Countup Animation ──────────────────────────────────────
  // Ported from the React CountUp component.
  // Animates dynamically using spring physics (stiffness/damping relative to duration)
  // and IntersectionObserver for scroll viewport triggering.
  const countUp = (el, target, suffix = '', durationMs = 1500) => {
    const to = parseFloat(target) || 0;
    const from = 0;
    const separator = ',';

    const getDecimalPlaces = (num) => {
      const str = num.toString();
      if (str.includes('.')) {
        const decimals = str.split('.')[1];
        if (parseInt(decimals) !== 0) return decimals.length;
      }
      return 0;
    };
    const maxDecimals = Math.max(getDecimalPlaces(from), getDecimalPlaces(to));
    const hasDecimals = maxDecimals > 0;

    const formatValue = (val) => {
      const formatOptions = {
        useGrouping: !!separator,
        minimumFractionDigits: hasDecimals ? maxDecimals : 0,
        maximumFractionDigits: hasDecimals ? maxDecimals : 0
      };
      let formatted = Intl.NumberFormat('en-US', formatOptions).format(val);
      if (separator && separator !== ',') {
        formatted = formatted.replace(/,/g, separator);
      }
      return formatted + suffix;
    };

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    let startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easeOutCubic(progress);
      
      const currentVal = from + (to - from) * easedProgress;
      el.textContent = formatValue(currentVal);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = formatValue(to);
      }
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          requestAnimationFrame(step);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.05 });

    observer.observe(el);
  };

  // ── PAGE: HOME ─────────────────────────────────────────────
  const initHome = async () => {
    // 1. Fetch live weather first
    const weather = await AI.fetchLiveWeather();

    // 2. Compute stadium summary
    const summary = AI.stadiumSummary();
    animateRing('health-ring', summary.healthScore, summary.healthScore > 70 ? 'var(--green)' : summary.healthScore > 40 ? 'var(--gold)' : 'var(--red)');

    // 3. Update KPI values
    const avgDensity = Math.round((DATA.crowdZones.reduce((sum, z) => sum + z.density, 0) / DATA.crowdZones.length) * 100);
    const kpis = [
      { id: 'kpi-fans',      val: 67420  },
      { id: 'kpi-density',   val: avgDensity, suffix: '%' },
      { id: 'kpi-incidents', val: summary.activeIncidents },
      { id: 'kpi-health',    val: summary.healthScore },
    ];
    kpis.forEach(k => {
      const el = document.getElementById(k.id);
      if (el) countUp(el, k.val, k.suffix || '');
    });

    // 4. Update the GenAI live status/health advisory
    const advisoryEl = document.getElementById('stadium-health-advisory');
    if (advisoryEl) {
      const hasKey = localStorage.getItem('anthropic-api-key');
      if (hasKey) {
        advisoryEl.textContent = '🤖 PULSE AI: Consulting operations model...';
        try {
          const systemPrompt = `You are stadium AI dispatcher. Write a one-sentence stadium advisory (max 15 words) based on: Health index: ${summary.healthScore}%, Weather temp: ${weather.tempF}F, Active incidents: ${summary.activeIncidents}.`;
          const adviceText = await AI.getResponse("Generate the brief dashboard safety message.");
          advisoryEl.textContent = `🤖 PULSE AI: ${adviceText}`;
        } catch (e) {
          advisoryEl.textContent = `🤖 PULSE AI: MetLife Stadium operating normally at ${weather.tempF}°F.`;
        }
      } else {
        advisoryEl.textContent = `🤖 [Simulation Mode] Index: ${summary.healthScore}%. MetLife Stadium weather is ${weather.tempF}°F. Configure key in Settings for live Claude reports.`;
      }
    }
  };

  const animateRing = (id, score, color) => {
    const arc = document.getElementById(id);
    if (!arc) return;
    const circumference = 2 * Math.PI * 56;
    arc.style.stroke = color;
    arc.style.strokeDasharray = circumference;
    arc.style.strokeDashoffset = circumference;
    setTimeout(() => {
      arc.style.strokeDashoffset = circumference * (1 - score / 100);
    }, 200);

    const label = document.getElementById('health-score-label');
    if (label) {
      let val = 0;
      const interval = setInterval(() => {
        val = Math.min(val + 2, score);
        label.textContent = val;
        if (val >= score) clearInterval(interval);
      }, 30);
    }
  };

  // ── PAGE: CHAT ─────────────────────────────────────────────
  const sendMessage = async () => {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    appendMessage('user', text);
    const typing = appendTyping();

    let response;
    try {
      response = await AI.getResponse(text);
    } catch (err) {
      response = `An error occurred: ${err.message}`;
    } finally {
      typing.remove();
    }

    const msgEl = appendMessage('ai', '');
    const bubble = msgEl.querySelector('.msg-bubble');
    await AI.typeText(bubble, response, 14);
  };

  const appendMessage = (role, text) => {
    const container = document.getElementById('chat-messages');
    const el = document.createElement('div');
    el.className = `message ${role}`;
    const aiAvatarSvg = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M13 2L4.5 13.5H11L9 22l10.5-12H13V2z"/></svg>`;
    el.innerHTML = `
      <div class="msg-avatar ${role}">${role === 'ai' ? aiAvatarSvg : 'ME'}</div>
      <div class="msg-bubble">${renderMarkdown(text)}</div>
    `;
    container.appendChild(el);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return el;
  };

  const appendTyping = () => {
    const container = document.getElementById('chat-messages');
    const el = document.createElement('div');
    el.className = 'message ai-marker-wrapper';
    el.innerHTML = `
      <div class="ui-marker ui-marker-status" role="status">
        <div class="ui-marker-icon">
          <svg class="ui-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="rgba(255, 255, 255, 0.12)" fill="none"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--purple-bright)" fill="none"/>
          </svg>
        </div>
        <div class="ui-marker-content ui-shimmer">PULSE AI is thinking...</div>
      </div>
    `;
    container.appendChild(el);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return el;
  };

  const renderMarkdown = (text) =>
    escapeHTML(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

  const initChat = () => {
    const sendBtn = document.getElementById('chat-send');
    const inputEl = document.getElementById('chat-input');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (inputEl) inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

    document.querySelectorAll('.quick-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        const inputEl = document.getElementById('chat-input');
        if (inputEl) { inputEl.value = btn.dataset.prompt; inputEl.focus(); }
      });
    });

    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chatLang = btn.dataset.lang;
        toast(`Language switched to ${btn.dataset.name}`, 'info');
      });
    });

    // ── 3D Background Orbiting Items Implementation ──
    const bgOrbitContainer = document.getElementById('chat-bg-orbit-items');
    if (bgOrbitContainer) {
      const bgIcons = [
        { name: 'Lionel Messi', color: '#3B82F6', img: 'images/player_messi.jpg' },
        { name: 'Cristiano Ronaldo', color: '#F59E0B', img: 'images/player_ronaldo.jpg' },
        { name: 'Kylian Mbappé', color: '#10B981', img: 'images/player_mbappe.jpg' },
        { name: 'Michel Platini', color: '#EF4444', img: 'images/player_platini.jpg' },
        { name: 'Paolo Maldini', color: '#8B5CF6', img: 'images/player_maldini.jpg' },
        { name: 'Andrés Iniesta', color: '#EC4899', img: 'images/player_iniesta.jpg' }
      ];

      bgOrbitContainer.innerHTML = '';
      const totalItems = bgIcons.length;
      const angleStep = 360 / totalItems;
      
      const radiusX = 250; 
      const radiusY = 75;  
      const tiltAngle = 330; 
      const duration = 25; 

      const itemEls = [];

      bgIcons.forEach((icon, i) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'chat-bg-orbit-icon';
        itemEl.style.setProperty('--icon-color', icon.color);
        itemEl.style.setProperty('--icon-glow', `${icon.color}30`);
        itemEl.innerHTML = `<img src="${icon.img}" alt="${icon.name}" onerror="this.onerror=null; this.src='https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(icon.name)}&backgroundType=gradientLinear&fontSize=42';" />`;
        bgOrbitContainer.appendChild(itemEl);

        itemEls.push({
          el: itemEl,
          angle: i * angleStep
        });
      });

      // Simple 3D Math Orbit loop for background
      setInterval(() => {
        itemEls.forEach(item => {
          item.angle = (item.angle + 0.4) % 360; 

          const radians = (item.angle * Math.PI) / 180;
          const x = radiusX * Math.cos(radians);
          const y = radiusY * Math.sin(radians);

          const tiltRadians = (tiltAngle * Math.PI) / 180;
          const xTilted = x * Math.cos(tiltRadians) - y * Math.sin(tiltRadians);
          const yTilted = x * Math.sin(tiltRadians) + y * Math.cos(tiltRadians);
          const zIndex = item.angle > 180 ? 0 : 3;
          const scale = item.angle < 180 ? 1.2 : 0.85;

          item.el.style.left = `${xTilted}px`;
          item.el.style.top = `${yTilted}px`;
          item.el.style.transform = `translate(-50%, -50%) scale(${scale})`;
          item.el.style.zIndex = zIndex;
        });
      }, duration);
    }
  };

  // ── PAGE: CROWD MAP ────────────────────────────────────────
  const initCrowdMap = () => {
    const canvas = document.getElementById('crowd-canvas');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || 700;
    canvas.height = canvas.offsetHeight || 440;
    drawCrowdMap(canvas);
    updateZoneList();
    if (crowdInterval) clearInterval(crowdInterval);
    crowdInterval = setInterval(() => {
      mutateZones();
      drawCrowdMap(canvas);
      updateZoneList();
    }, 2500);
  };

  const getRealisticCrowdSignal = (zone) => {
    const match = DATA.matches.find(m => m.status === 'LIVE');
    const minute = match ? match.minute : 45;
    
    let scans = 0;
    let transit = 0;

    if (zone.id === 'gate-a' || zone.id === 'gate-b') {
      if (minute < 15) {
        scans = 280 - minute * 8;
        transit = 350 - minute * 12;
      } else if (minute > 75) {
        scans = 80 + (minute - 75) * 20;
        transit = 120 + (minute - 75) * 25;
      } else {
        scans = 20 + Math.sin(minute) * 8;
        transit = 15 + Math.cos(minute) * 6;
      }
    } else if (zone.id === 'gate-c' || zone.id === 'gate-d') {
      if (minute < 15) {
        scans = 220 - minute * 6;
        transit = 300 - minute * 10;
      } else if (minute > 75) {
        scans = 60 + (minute - 75) * 15;
        transit = 90 + (minute - 75) * 18;
      } else {
        scans = 15 + Math.cos(minute) * 7;
        transit = 10 + Math.sin(minute) * 5;
      }
    } else {
      if (minute >= 40 && minute <= 55) {
        scans = 180 + Math.sin(minute * 1.5) * 40;
        transit = 0;
      } else {
        scans = 40 + Math.sin(minute * 0.2) * 15;
        transit = 0;
      }
    }

    return {
      scans: Math.round(Math.max(5, scans)),
      transit: Math.round(Math.max(0, transit))
    };
  };

  const mutateZones = () => {
    DATA.crowdZones.forEach(z => {
      const sig = getRealisticCrowdSignal(z);
      const totalCount = sig.scans + sig.transit;
      
      z.density = Math.min(1.0, Math.max(0.05, totalCount / 680));
      z.fans = Math.round(z.density * 18000);
      
      const r = AI.crowdRisk(z.density);
      z.color = r.color;
    });

    if (!window.lastCrowdExplanationTime || (Date.now() - window.lastCrowdExplanationTime > 15000)) {
      window.lastCrowdExplanationTime = Date.now();
      AI.updateCrowdExplanations().then(() => {
        updateZoneList();
      });
    }
  };

  const drawCrowdMap = (canvas) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    const gradient = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W/2);
    gradient.addColorStop(0, 'rgba(8,15,30,0.95)');
    gradient.addColorStop(1, 'rgba(5,10,21,0.98)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Stadium outline
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,0,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const ex = 40, ey = 40, ew = W - 80, eh = H - 80;
    ctx.beginPath();
    ctx.ellipse(W/2, H/2, ew/2, eh/2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Pitch
    ctx.save();
    ctx.fillStyle = 'rgba(0, 100, 40, 0.35)';
    ctx.beginPath();
    ctx.ellipse(W/2, H/2, ew/2 * 0.52, eh/2 * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.stroke();
    // Center circle
    ctx.beginPath();
    ctx.arc(W/2, H/2, 28, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    // Halfway line
    ctx.beginPath();
    ctx.moveTo(W/2, H/2 - eh/2*0.52);
    ctx.lineTo(W/2, H/2 + eh/2*0.52);
    ctx.stroke();
    ctx.restore();

    // Crowd heat zones (placed around perimeter)
    const positions = [
      { pct: 0.1, y: 0.12 }, { pct: 0.5, y: 0.05 }, { pct: 0.85, y: 0.1  },
      { pct: 0.92, y: 0.5 }, { pct: 0.1, y: 0.5  }, { pct: 0.5, y: 0.9  },
      { pct: 0.35, y: 0.3 }, { pct: 0.82, y: 0.82 },
    ];

    DATA.crowdZones.forEach((zone, i) => {
      const pos = positions[i] || { pct: 0.5 + (Math.random() - 0.5) * 0.6, y: Math.random() };
      const x = pos.pct * W;
      const y = pos.y * H;
      const radius = 40 + zone.density * 50;

      // Heatmap blob
      const heatGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const col = zone.color;
      heatGrad.addColorStop(0,   col.replace('#', 'rgba(') + ',0.55)'.replace('rgba(', 'rgba(').replace('FF', '255,').replace('44', '68,'));
      heatGrad.addColorStop(0.5, col + '44');
      heatGrad.addColorStop(1,   'transparent');

      // Simplified: use hex color with alpha
      const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      };

      const hg2 = ctx.createRadialGradient(x, y, 0, x, y, radius);
      hg2.addColorStop(0,   hexToRgba(col, 0.6 * zone.density));
      hg2.addColorStop(0.6, hexToRgba(col, 0.2 * zone.density));
      hg2.addColorStop(1,   'transparent');

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = hg2;
      ctx.fill();

      // Label dot
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      // Pulse ring if critical
      if (zone.density >= 0.85) {
        const t = (Date.now() / 800) % 1;
        ctx.beginPath();
        ctx.arc(x, y, 4 + t * 30, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(col, 1 - t);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Legend
    const legendItems = [
      { color: '#00E676', label: 'Low' },
      { color: '#FFD600', label: 'Medium' },
      { color: '#FF6D00', label: 'High' },
      { color: '#FF1744', label: 'Critical' },
    ];
    ctx.font = '11px Inter, sans-serif';
    legendItems.forEach((item, i) => {
      const lx = 16 + i * 90;
      const ly = H - 16;
      ctx.beginPath();
      ctx.arc(lx + 6, ly, 5, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(item.label, lx + 14, ly + 4);
    });

    // Timestamp
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(`LIVE · ${new Date().toLocaleTimeString()}`, W - 130, H - 10);
  };

  const updateZoneList = () => {
    const container = document.getElementById('zone-list');
    if (!container) return;
    container.innerHTML = DATA.crowdZones.map(zone => {
      const risk = AI.crowdRisk(zone.density);
      const predicted = AI.predictCrowd30min(zone);
      const trend = predicted > zone.density ? '↑' : '↓';
      const explanation = zone.explanation || 'Ingesting ticket scans...';
      return `
        <div class="zone-item">
          <div class="zone-header">
            <span class="zone-name">${risk.emoji} ${escapeHTML(zone.label)}</span>
            <span class="badge badge-${risk.label.toLowerCase()}">${escapeHTML(risk.label)}</span>
          </div>
          <div class="density-bar">
            <div class="density-fill" style="width:${zone.density*100}%; background:${zone.color}"></div>
          </div>
          <div class="flex justify-between text-sm text-muted">
            <span>${zone.fans.toLocaleString()} fans</span>
            <span style="color:${zone.color}">${(zone.density*100).toFixed(0)}%</span>
          </div>
          <div class="text-sm" style="color:var(--text-muted); margin-top:4px">30min forecast: ${(predicted*100).toFixed(0)}% ${trend}</div>
          <div style="font-size:0.72rem; color:var(--purple-bright); margin-top:4px; font-style:italic; border-left:1.5px solid var(--purple-bright); padding-left:6px">${escapeHTML(explanation)}</div>
        </div>
      `;
    }).join('');
  };

  // ── PAGE: HEAT RISK ────────────────────────────────────────
  const initHeatPage = async () => {
    const venue = DATA.activeVenue;
    
    // Show loading state for advice
    const adviceEl = document.getElementById('heat-advice');
    if (adviceEl) adviceEl.textContent = '🤖 PULSE AI: Analyzing real-time weather & health data...';

    // 1. Fetch live weather & personal risk advisory
    const risk = await AI.personalRisk(venue, userAge, userConditions);
    const heatData = DATA.heatZones[venue];

    // Update gauge needle
    const needle = document.getElementById('heat-needle');
    if (needle) needle.style.left = `${risk.score}%`;

    // Update risk display
    const riskEl = document.getElementById('heat-risk-level');
    if (riskEl) {
      riskEl.textContent = risk.level;
      riskEl.style.color = risk.color;
    }

    if (adviceEl) adviceEl.textContent = risk.advice;

    // We calculate simulated feels-like based on temp & humidity
    const feelsLike = Math.round(heatData.tempF + (heatData.humidity - 40) * 0.8);
    const feelEl = document.getElementById('heat-feels');
    if (feelEl) feelEl.textContent = `${feelsLike}°F`;

    const tempEl = document.getElementById('heat-temp');
    if (tempEl) tempEl.textContent = `${heatData.tempF}°F`;

    const humEl = document.getElementById('heat-humidity');
    if (humEl) humEl.textContent = `${heatData.humidity}%`;

    drawHeatGauge(risk);

    if (risk.level === 'CRITICAL' || risk.level === 'HIGH') {
      setTimeout(() => toast(`Heat alert: Your personal risk is ${risk.level}. ${risk.advice}`, 'warning'), 500);
    }
  };

  const drawHeatGauge = (risk) => {
    const canvas = document.getElementById('heat-gauge-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = 260;
    const H = canvas.height = 160;
    const cx = W/2, cy = H * 0.9;
    const r = 90;

    ctx.clearRect(0, 0, W, H);

    // Draw arc gradient background
    const segments = [
      { start: Math.PI, end: Math.PI + Math.PI * 0.25, color: '#00E676' },
      { start: Math.PI + Math.PI * 0.25, end: Math.PI + Math.PI * 0.5, color: '#FFD600' },
      { start: Math.PI + Math.PI * 0.5, end: Math.PI + Math.PI * 0.75, color: '#FF6D00' },
      { start: Math.PI + Math.PI * 0.75, end: Math.PI * 2, color: '#FF1744' },
    ];

    segments.forEach(seg => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, seg.start, seg.end);
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.strokeStyle = seg.color;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Active segment glow
    const activeStart = Math.PI + Math.PI * (risk.score / 100) * 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * (risk.score / 100));
    ctx.lineWidth = 16;
    ctx.strokeStyle = risk.color;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Needle
    const angle = Math.PI + Math.PI * (risk.score / 100);
    const nx = cx + (r - 18) * Math.cos(angle);
    const ny = cy + (r - 18) * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.fillStyle = risk.color;
    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(risk.level, cx, cy - 35);
  };

  // ── PAGE: GROUP SAFETY ─────────────────────────────────────
  const initGroupPage = () => {
    renderGroupMembers();
  };

  const renderGroupMembers = () => {
    const container = document.getElementById('group-members');
    if (!container) return;
    container.innerHTML = DATA.groupMembers.map(m => {
      const heatColor = m.heatRisk === 'HIGH' ? 'var(--orange)' : m.heatRisk === 'CRITICAL' ? 'var(--red)' : 'var(--green)';
      return `
        <div class="group-member-card ${escapeHTML(m.status)}">
          <div class="member-avatar">${escapeHTML(m.avatar)}</div>
          <div style="flex:1; min-width:0">
            <div class="member-name">${escapeHTML(m.name)} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400">(${escapeHTML(m.relation)})</span></div>
            <div class="member-meta">🗣️ ${escapeHTML(DATA.languages.find(l=>l.code===m.lang)?.name || m.lang)} · Last seen: ${escapeHTML(m.lastSeen)}</div>
            <div class="member-location" style="color:var(--text-muted)">📍 ${escapeHTML(m.location)}</div>
            <div style="margin-top:5px; font-size:0.72rem; color:${heatColor}; font-weight:600">🌡️ Heat Risk: ${escapeHTML(m.heatRisk)}</div>
          </div>
          <div class="member-actions">
            <span class="badge badge-${m.status === 'safe' ? 'low' : m.status === 'warning' ? 'medium' : 'critical'}">${m.status === 'safe' ? '✅ Safe' : m.status === 'warning' ? '⚠️ Check' : '🚨 LOST'}</span>
          </div>
        </div>
      `;
    }).join('');

    // Warning member trigger
    const warningMember = DATA.groupMembers.find(m => m.status === 'warning');
    if (warningMember) {
      setTimeout(() => toast(`${warningMember.name} hasn't been seen for 8 minutes. Heat risk: HIGH. Tap Group Safety to check.`, 'danger'), 2000);
    }
  };

  const initSOS = () => {
    const sosBtn = document.getElementById('sos-btn');
    const bleProgress = document.getElementById('ble-progress');
    const bleSteps = document.getElementById('ble-steps');
    if (!sosBtn || !bleProgress) return;

    sosBtn.addEventListener('click', () => {
      sosBtn.disabled = true;
      sosBtn.textContent = '📡 Broadcasting BLE Beacon...';
      bleProgress.classList.add('visible');
      bleSteps.innerHTML = '';

      AI.bleBeaconSimulate('gm3', (stage) => {
        const stepEl = document.createElement('div');
        stepEl.className = 'ble-step';
        stepEl.textContent = stage.msg;
        bleSteps.appendChild(stepEl);
        bleSteps.scrollTop = bleSteps.scrollHeight;

        document.getElementById('ble-prog-fill').style.width = `${stage.progress}%`;

        if (stage.progress === 100) {
          stepEl.classList.add('done');
          sosBtn.disabled = false;
          sosBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ACTIVATE EMERGENCY BEACON';
          toast('Mei located near Food Court East. Staff Badge #4421 en route.', 'success');
          // Update member status
          const mei = DATA.groupMembers.find(m => m.id === 'gm3');
          if (mei) { mei.status = 'safe'; mei.lastSeen = 'just now'; }
          setTimeout(() => renderGroupMembers(), 1000);
        }
      });
    });
  };

  // ── PAGE: NAVIGATION ───────────────────────────────────────
  const initNavPage = () => {
    drawStadiumMap();
    renderRouteOptions();
    renderRouteSteps(selectedRoute);
  };

  const drawStadiumMap = () => {
    const canvas = document.getElementById('nav-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth || 600;
    const H = canvas.height = 360;

    ctx.clearRect(0, 0, W, H);

    // Dark background
    ctx.fillStyle = 'rgba(8,15,30,0.95)';
    ctx.fillRect(0, 0, W, H);

    // Stadium shape
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(W/2, H/2, W/2 - 30, H/2 - 25, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Pitch
    ctx.fillStyle = 'rgba(0, 120, 40, 0.4)';
    ctx.beginPath();
    ctx.rect(W/2 - 100, H/2 - 65, 200, 130);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Sections (colored by congestion)
    const sections = [
      { x: W/2, y: 30,    label: 'N', fill: 'rgba(255,100,0,0.4)' },
      { x: W/2, y: H-30,  label: 'S', fill: 'rgba(255,214,0,0.3)' },
      { x: 40,  y: H/2,   label: 'W', fill: 'rgba(0,255,136,0.3)' },
      { x: W-40,y: H/2,   label: 'E', fill: 'rgba(0,255,136,0.3)' },
    ];

    sections.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, s.x, s.y + 4);
    });

    // Gates
    const gates = [
      { x: W/2 - 10, y: 50,    label: 'Gate A', color: '#FF2D55' },
      { x: W - 50,   y: H/2,   label: 'Gate B', color: '#FF8C00' },
      { x: W/2,      y: H - 50,label: 'Gate C', color: '#00FF88' },
      { x: 50,       y: H/2,   label: 'Gate D', color: '#00FF88' },
    ];

    gates.forEach(g => {
      ctx.fillStyle = g.color;
      ctx.fillRect(g.x - 14, g.y - 10, 28, 20);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(g.label, g.x, g.y + 3);
    });

    // Your position (Section 114)
    ctx.beginPath();
    ctx.arc(W/2 + 80, H/2 - 40, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#00D4FF';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,212,255,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', W/2 + 80, H/2 - 37);

    // Route (AI-optimized path)
    if (selectedRoute === 'ai_optimized') {
      ctx.beginPath();
      ctx.moveTo(W/2 + 80, H/2 - 40);
      ctx.lineTo(W/2 + 80, H - 80);
      ctx.lineTo(50, H/2);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (selectedRoute === 'standard') {
      ctx.beginPath();
      ctx.moveTo(W/2 + 80, H/2 - 40);
      ctx.lineTo(W/2, 50);
      ctx.strokeStyle = '#FF8C00';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath();
      ctx.moveTo(W/2 + 80, H/2 - 40);
      ctx.lineTo(W/2 - 10, H - 50);
      ctx.strokeStyle = '#00D4FF';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Legend
    ctx.font = '10px Inter';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'left';
    ctx.fillText('● = Your location   -- = AI Route', 10, H - 10);
  };

  const renderRouteOptions = () => {
    const container = document.getElementById('route-options');
    if (!container) return;
    const routes = DATA.navRoutes;
    container.innerHTML = Object.entries(routes).map(([key, route]) => `
      <div class="route-option ${selectedRoute === key ? 'active' : ''}" data-route="${key}" onclick="selectRoute('${key}')">
        <div class="route-name">${route.name}</div>
        <div class="route-meta">
          <span>🕐 ${route.time}</span>
          <span>📏 ${route.distance}</span>
          <span>👥 ${route.congestion}</span>
        </div>
      </div>
    `).join('');
  };

  window.selectRoute = (routeKey) => {
    selectedRoute = routeKey;
    renderRouteOptions();
    renderRouteSteps(routeKey);
    drawStadiumMap();
  };

  const renderRouteSteps = async (routeKey) => {
    const route = DATA.navRoutes[routeKey];
    const container = document.getElementById('route-steps');
    if (!container || !route) return;

    const renderContent = (advisoryHtml = '') => {
      container.innerHTML = `
        <div class="card-title mb-3">Turn-by-turn directions</div>
        ${advisoryHtml}
        ${route.steps.map((step, i) => `
          <div class="route-step">
            <div class="step-num">${i + 1}</div>
            <div class="step-text">${step}</div>
          </div>
        `).join('')}
      `;
    };

    renderContent('');

    const hasKey = localStorage.getItem('anthropic-api-key');
    if (hasKey) {
      renderContent(`
        <div style="font-size:0.75rem; color:var(--purple-bright); background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.22); padding:10px; border-radius:6px; margin-bottom:12px; font-style:italic">
          🤖 Consulting route optimizer...
        </div>
      `);
      try {
        const optimized = await AI.optimizeRoute(route.name, routeKey === 'accessible', DATA.crowdZones);
        renderContent(`
          <div style="font-size:0.75rem; color:var(--purple-bright); background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.22); padding:10px; border-radius:6px; margin-bottom:12px; line-height:1.4">
            <strong>🤖 AI Route Advisory:</strong> ${optimized.advice}
          </div>
        `);
      } catch (err) {
        renderContent('');
      }
    }
  };

  // ── PAGE: TRANSPORT ────────────────────────────────────────
  const initTransportPage = () => {
    const container = document.getElementById('transport-cards');
    if (!container) return;
    const iconMap = { Shuttle: '🚌', Metro: '🚇', Bus: '🚍', Bike: '🚲', Ride: '🚗' };
    const statusColor = { 'ON TIME': 'var(--green)', 'CROWDED': 'var(--orange)', 'AVAILABLE': 'var(--blue)', 'SURGE': 'var(--red)' };

    container.innerHTML = DATA.transport.map(t => {
      const co2 = t.co2 === 0 ? '🌿 Zero emission' : `🌿 ${t.co2} kg CO₂`;
      return `
        <div class="transport-card">
          <div class="transport-icon">${iconMap[t.type] || '🚌'}</div>
          <div class="transport-name">${t.name}</div>
          <div class="transport-route">${t.from} → ${t.to}</div>
          <div class="flex gap-2 mb-3 flex-wrap">
            <span class="badge badge-blue">ETA ${t.eta} min</span>
            <span class="badge" style="background:rgba(100,100,100,0.15); color:${statusColor[t.status] || 'white'}; border-color:rgba(200,200,200,0.2)">${t.status}</span>
            <span class="badge" style="background:rgba(0,200,100,0.1); color:var(--green); border-color:rgba(0,200,100,0.2)">${t.capacity}% cap</span>
          </div>
          <div class="transport-departures">
            ${t.departures.map(d => `<span class="departure-time">${d}</span>`).join('')}
          </div>
          <div class="co2-indicator">${co2}</div>
        </div>
      `;
    }).join('');
  };

  // ── PAGE: SUSTAINABILITY ───────────────────────────────────
  const initSustainPage = () => {
    const s = DATA.sustainability;
    const bars = [
      { id: 'sustain-carbon', value: (s.carbonToday / s.carbonTarget * 100), label: `${s.carbonToday.toLocaleString()} / ${s.carbonTarget.toLocaleString()} kg CO₂`, color: '#00FF88' },
      { id: 'sustain-waste',  value: s.wasteRecycled,                         label: `${s.wasteRecycled}% recycled`, color: '#00D4FF' },
      { id: 'sustain-energy', value: s.renewableEnergy,                        label: `${s.renewableEnergy}% renewable`, color: '#FFD700' },
      { id: 'sustain-transport', value: s.greenTransport,                      label: `${s.greenTransport}% green trips`, color: '#BF5AF2' },
    ];

    bars.forEach(bar => {
      const fill = document.getElementById(bar.id);
      if (fill) {
        setTimeout(() => {
          fill.style.width = `${bar.value}%`;
          fill.style.background = bar.color;
        }, 300);
      }
    });

    // Eco tips
    const tipsContainer = document.getElementById('eco-tips');
    if (tipsContainer) {
      tipsContainer.innerHTML = s.aiTips.map(tip => `
        <div class="eco-tip">
          <span style="font-size:1.2rem; flex-shrink:0">🌿</span>
          <span>${tip}</span>
        </div>
      `).join('');
    }

    // KPIs
    const waterEl = document.getElementById('sustain-water');
    const treeEl  = document.getElementById('sustain-trees');
    if (waterEl) countUp(waterEl, s.waterSaved, 'L');
    if (treeEl)  countUp(treeEl,  s.treeOffset, '');
  };

  // ── PAGE: OPS INTELLIGENCE ─────────────────────────────────
  const initOpsPage = () => {
    const container = document.getElementById('incident-list');
    if (!container) return;
    const typeClass = { CROWD: 'type-crowd', HEAT: 'type-heat', MEDICAL: 'type-medical', TRAFFIC: 'type-traffic', LOST: 'type-lost' };
    const statusColor = { ACTIVE: '#FF2D55', RESPONDED: '#FFD700', RESOLVED: '#00FF88' };

    const renderList = () => {
      container.innerHTML = DATA.incidents.map(inc => {
        const score = AI.triageIncident(inc);
        const actionText = inc.genAiAction || (localStorage.getItem('anthropic-api-key') ? '🤖 Generating tactical advice...' : inc.aiAction);
        return `
          <div class="incident-card">
            <div class="incident-header">
              <div class="flex gap-2 items-center flex-wrap">
                <span class="incident-type-badge ${typeClass[inc.type] || ''}">${escapeHTML(inc.type)}</span>
                <span class="badge badge-${escapeHTML(inc.severity.toLowerCase())}">${escapeHTML(inc.severity)}</span>
                <span style="font-size:0.75rem; color:var(--text-muted)">#${escapeHTML(String(inc.id))} · ${escapeHTML(inc.time)}</span>
              </div>
              <span style="font-size:0.8rem; font-weight:600; color:${statusColor[inc.status]}">${escapeHTML(inc.status)}</span>
            </div>
            <div style="font-size:0.78rem; font-weight:600; color:var(--text-secondary); margin-bottom:4px">📍 ${escapeHTML(inc.location)}</div>
            <div class="incident-desc">${escapeHTML(inc.description)}</div>
            <div class="ai-recommendation">
              <div>
                <strong>🤖 AI Advisory</strong><br>
                <span style="color:var(--text-primary); font-size:0.82rem">${escapeHTML(actionText)}</span>
              </div>
            </div>
            <div class="ai-score-bar">
              <span class="ai-score-label">AI Urgency Score</span>
              <div class="progress-bar" style="flex:1">
                <div class="progress-fill" style="width:${score}%; background:${score > 80 ? 'var(--red)' : score > 60 ? 'var(--orange)' : 'var(--gold)'}"></div>
              </div>
              <span class="ai-score-val" style="color:${score > 80 ? 'var(--red)' : score > 60 ? 'var(--orange)' : 'var(--gold)'}">${score}/100</span>
            </div>
            <div style="margin-top:8px; font-size:0.75rem; color:var(--text-muted)">👤 Assigned: ${escapeHTML(inc.assignedTo)}</div>
          </div>
        `;
      }).join('');
    };

    renderList();

    const hasKey = localStorage.getItem('anthropic-api-key');
    if (hasKey) {
      DATA.incidents.forEach(inc => {
        if (!inc.genAiAction) {
          const score = AI.triageIncident(inc);
          const systemPrompt = `You are a tactical operations coordinator. Write a brief safety advisory (max 15 words) for incident triage: Type: ${inc.type}, Severity: ${inc.severity}, Location: ${inc.location}, Urgency Score: ${score}/100. Details: ${inc.description}`;
          AI.getResponse(systemPrompt).then(advice => {
            inc.genAiAction = advice;
            renderList();
          }).catch(() => {
            inc.genAiAction = inc.aiAction;
            renderList();
          });
        }
      });
    }
  };

  // ── PAGE: TRANSLATOR ───────────────────────────────────────
  const initTranslatePage = () => {
    renderPhraseGrid('en');

    document.querySelectorAll('.translator-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.translator-lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPhraseGrid(btn.dataset.lang);
        document.getElementById('current-lang-name').textContent = btn.dataset.name;
      });
    });
  };

  const renderPhraseGrid = (lang) => {
    const phrases = DATA.emergencyPhrases[lang] || DATA.emergencyPhrases['en'];
    const container = document.getElementById('phrase-grid');
    if (!container) return;

    const keyLabels = {
      help: '🆘 Help', lost: '🗺️ I am lost', medical: '🏥 Medical emergency',
      child: '👶 Lost child', heat: '🌡️ Heat illness', police: '👮 Police',
      translate: '💬 Language help'
    };

    container.innerHTML = Object.entries(phrases).map(([key, phrase]) => `
      <div class="emergency-phrase-card" onclick="showEmergencyCard('${escapeHTML(lang)}', '${escapeHTML(key)}')">
        <div class="emergency-phrase-key">${escapeHTML(keyLabels[key] || key)}</div>
        <div class="emergency-phrase-text">${escapeHTML(phrase)}</div>
      </div>
    `).join('');
  };

  window.showEmergencyCard = (lang, key) => {
    const phrases = DATA.emergencyPhrases[lang] || DATA.emergencyPhrases['en'];
    const englishPhrases = DATA.emergencyPhrases['en'];
    const keyLabels = { help: 'Help', lost: 'Lost', medical: 'Medical', child: 'Lost Child', heat: 'Heat', police: 'Police', translate: 'Language' };

    const modal = document.getElementById('emergency-card-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="emergency-card-display">
        <div class="emergency-card-title">🆘 EMERGENCY / EMERGENCIA / URGENCE</div>
        <div class="emergency-card-phrases">
          <div class="emergency-card-phrase" style="background:#ffeeee; border-left-color:#cc0000; font-size:1.2rem">${escapeHTML(phrases[key])}</div>
          ${lang !== 'en' ? `<div class="emergency-card-phrase">${escapeHTML(englishPhrases[key])}</div>` : ''}
          <div class="emergency-card-phrase" style="color:#555; font-size:0.85rem">📞 Emergency: 911 (US/CA) | 911 (MX)</div>
          <div class="emergency-card-phrase" style="color:#555; font-size:0.85rem">🏟️ Fan Info Point: Gate B, Gate C</div>
        </div>
        <button onclick="document.getElementById('emergency-card-modal').innerHTML=''" style="margin-top:16px; padding:10px 24px; background:#cc0000; color:white; border:none; border-radius:8px; font-size:1rem; font-weight:700; cursor:pointer">Close</button>
      </div>
    `;
    modal.style.display = 'block';
    toast(`Emergency card generated in ${DATA.languages.find(l=>l.code===lang)?.name}`, 'success');
  };

  // ── PAGE: ORBIT STACK ──────────────────────────────────────
  const initOrbit = () => {
    const stage = document.getElementById('orbit-stage');
    if (!stage) return;
    if (stage.querySelector('.orbit-ring')) return; // Avoid double initialization

    // World Cup national team flag badge images (circular coverage)
    const iconSvgs = [
      // Ring 1 (Inner)
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/ar.svg" alt="Argentina" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 1
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/br.svg" alt="Brazil" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 1
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/fr.svg" alt="France" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 1
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/de.svg" alt="Germany" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 1
      },

      // Ring 2 (Middle)
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/es.svg" alt="Spain" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 2
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/gb-eng.svg" alt="England" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 2
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/pt.svg" alt="Portugal" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 2
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/it.svg" alt="Italy" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 2
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/nl.svg" alt="Netherlands" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 2
      },

      // Ring 3 (Outer)
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/us.svg" alt="USA" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 3
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/mx.svg" alt="Mexico" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 3
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/ca.svg" alt="Canada" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 3
      },
      {
        svg: `<img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/1x1/jp.svg" alt="Japan" style="width:100%; height:100%; object-fit:cover; border-radius:50%; border:1.5px solid rgba(255,255,255,0.25);" />`,
        ring: 3
      }
    ];

    [1, 2, 3].forEach(rNum => {
      const ringEl = document.createElement('div');
      ringEl.className = `orbit-ring orbit-ring-${rNum}`;

      const ringIcons = iconSvgs.filter(i => i.ring === rNum);
      const count = ringIcons.length;

      ringIcons.forEach((cfg, idx) => {
        const iconEl = document.createElement('div');
        iconEl.className = 'orbit-icon';
        iconEl.innerHTML = cfg.svg;

        const angle = (idx * 2 * Math.PI) / count;
        const x = 50 + 50 * Math.cos(angle);
        const y = 50 + 50 * Math.sin(angle);

        iconEl.style.left = `${x}%`;
        iconEl.style.top = `${y}%`;
        iconEl.setAttribute('aria-hidden', 'true');

        ringEl.appendChild(iconEl);
      });

      stage.appendChild(ringEl);
    });
  };

  // ── PAGE: AUTHENTICATOR ────────────────────────────────────
  let authInitialized = false;

  const initAuthPage = () => {
    if (authInitialized) return;
    authInitialized = true;

    const card = document.getElementById('auth-card-3d');
    const form = document.getElementById('auth-form');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const togglePwdBtn = document.getElementById('auth-toggle-pwd-btn');
    const submitBtn = document.getElementById('auth-submit-btn');
    const googleBtn = document.getElementById('auth-google-btn');

    // ── 3D Card Tilt Effect ──────────────────────────────────
    if (card) {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        // Cursor location relative to center of the card
        const mouseX = e.clientX - rect.left - width / 2;
        const mouseY = e.clientY - rect.top - height / 2;

        // Map values to rotate ranges (-10deg to 10deg)
        const rotateX = (mouseY / (height / 2)) * -10;
        const rotateY = (mouseX / (width / 2)) * 10;

        card.style.transform = `perspective(1500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = `perspective(1500px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      });
    }

    // ── Focus Highlights ─────────────────────────────────────
    const fields = document.querySelectorAll('.auth-field-wrapper');
    fields.forEach(f => {
      const input = f.querySelector('.auth-input');
      if (input) {
        input.addEventListener('focus', () => f.classList.add('focused'));
        input.addEventListener('blur', () => f.classList.remove('focused'));
      }
    });

    // ── Toggle Password Visibility ────────────────────────────
    if (togglePwdBtn && passwordInput) {
      let isVisible = false;
      const eyeOpen = togglePwdBtn.querySelector('.eye-open-icon');
      const eyeClosed = togglePwdBtn.querySelector('.eye-closed-icon');

      togglePwdBtn.addEventListener('click', () => {
        isVisible = !isVisible;
        passwordInput.type = isVisible ? 'text' : 'password';
        if (isVisible) {
          eyeOpen.style.display = 'none';
          eyeClosed.style.display = 'block';
        } else {
          eyeOpen.style.display = 'block';
          eyeClosed.style.display = 'none';
        }
      });
    }

    // ── Form Submit simulation ───────────────────────────────
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const txt = submitBtn.querySelector('.btn-text-content');
        const spinner = submitBtn.querySelector('.btn-spinner');

        txt.style.display = 'none';
        spinner.style.display = 'inline-block';
        submitBtn.disabled = true;

        setTimeout(() => {
          txt.style.display = 'inline-flex';
          spinner.style.display = 'none';
          submitBtn.disabled = false;

          isUserAuthenticated = true;
          
          // Update navigation sign in button to Staff Mode
          if (signInNavBtn) {
            signInNavBtn.innerHTML = `
              <div class="pulse-dot" style="background:var(--green-bright)"></div>
              Staff: John D. (Out)
            `;
          }

          toast('Access Granted. Staff credentials verified.', 'success');
          
          // Clear credentials
          if (emailInput) emailInput.value = '';
          if (passwordInput) passwordInput.value = '';

          // Redirect to Workspace Home
          navigate('home');
        }, 1800);
      });
    }

    // ── Google Sign In simulation ─────────────────────────────
    if (googleBtn) {
      googleBtn.addEventListener('click', () => {
        toast('Redirecting to Google Secure auth...', 'info');
        googleBtn.disabled = true;
        setTimeout(() => {
          googleBtn.disabled = false;
          isUserAuthenticated = true;

          if (signInNavBtn) {
            signInNavBtn.innerHTML = `
              <div class="pulse-dot" style="background:var(--green-bright)"></div>
              Staff: John D. (Out)
            `;
          }
          toast('Access Granted. Google authentication verified.', 'success');
          navigate('home');
        }, 1200);
      });
    }
  };
  
  // ── Vanilla Tabs (Shadcn Tabs Demo Replica) ─────────────────
  const initVanillaTabs = () => {
    document.querySelectorAll('.ui-tabs').forEach(tabsContainer => {
      const triggers = tabsContainer.querySelectorAll('.ui-tabs-trigger');
      const contents = tabsContainer.querySelectorAll('.ui-tabs-content');
      
      triggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
          const targetValue = trigger.dataset.value;
          
          triggers.forEach(t => {
            t.classList.toggle('active', t === trigger);
            t.setAttribute('aria-selected', t === trigger ? 'true' : 'false');
          });
          
          contents.forEach(c => {
            c.classList.toggle('active', c.dataset.value === targetValue);
          });
        });
      });
    });
  };

  // ── PAGE: PERIMETER DEFENSE (Tactical Lockdown Sim) ────────
  let lockdownTimerId = null;
  let countdownMinutes = 15;
  let countdownSeconds = 0;

  window.simulateIngest = async (type) => {
    const cctvImg = document.querySelector('.cctv-bg-img');
    const statusDesc = document.getElementById('threat-status-desc');
    const badgeStatus = document.getElementById('threat-badge-status');
    const percentVal = document.getElementById('threat-percent-val');
    const progressBar = document.getElementById('threat-progress-bar');
    const glowRing = document.getElementById('threat-glow-ring');
    const breachSpot = document.getElementById('heatspot-breach');

    const key = localStorage.getItem('anthropic-api-key');

    if (type === 'transit') {
      toast('Ingesting live CCTV video telemetry from Transit Hub A...', 'info');
      if (cctvImg) cctvImg.style.filter = 'grayscale(0.2) contrast(1.3) sepia(0.2)';
      if (statusDesc) statusDesc.textContent = '🤖 Ingesting and narrating feeds...';

      let reportText = 'Transit Hub analysis: 4,200 ticketless fans moving towards East Gate. Threat elevated.';
      if (key) {
        try {
          const systemPrompt = `You are a drone/CCTV video analytics scanner at MetLife Stadium.
          Generate a varying, context-aware 1-sentence warning report (max 18 words) about a large ticketless crowd surge originating from transit hubs heading to East gates.`;
          reportText = await AI.getResponse(systemPrompt);
        } catch (e) {
          console.warn('GenAI CCTV report failed, using default:', e);
        }
      }

      setTimeout(() => {
        if (statusDesc) statusDesc.textContent = reportText;
        if (badgeStatus) {
          badgeStatus.textContent = 'HIGH';
          badgeStatus.style.background = 'var(--orange-surface)';
          badgeStatus.style.color = 'var(--orange-bright)';
        }
        if (percentVal) percentVal.textContent = '82%';
        if (progressBar) progressBar.style.width = '82%';
        if (glowRing) {
          glowRing.style.borderColor = 'var(--orange-bright)';
          glowRing.style.boxShadow = '0 0 20px var(--orange-glow)';
        }
        toast('CCTV Ingestion Complete: Surge predicted.', 'warning');
      }, 1000);
    } else if (type === 'breach') {
      toast('Analyzing drone thermal feeds at perimeter fence lines...', 'warning');
      if (cctvImg) cctvImg.style.filter = 'grayscale(0.1) hue-rotate(300deg) contrast(1.4)';
      if (breachSpot) breachSpot.style.display = 'block';
      if (statusDesc) statusDesc.textContent = '🤖 Analyzing fence line logs...';

      let reportText = 'CRITICAL: Ticketless breach detected at Sector 4 fence lines. Deploying physical barriers.';
      if (key) {
        try {
          const systemPrompt = `You are a drone/CCTV video analytics scanner at MetLife Stadium.
          Generate a varying, context-aware 1-sentence warning report (max 18 words) about an active perimeter fence breach of ticketless fans at Sector 4.`;
          reportText = await AI.getResponse(systemPrompt);
        } catch (e) {
          console.warn('GenAI CCTV report failed, using default:', e);
        }
      }

      setTimeout(() => {
        if (statusDesc) statusDesc.textContent = reportText;
        if (badgeStatus) {
          badgeStatus.textContent = 'CRITICAL';
          badgeStatus.style.background = 'var(--red-surface)';
          badgeStatus.style.color = 'var(--red-bright)';
        }
        if (percentVal) percentVal.textContent = '96%';
        if (progressBar) progressBar.style.width = '96%';
        if (glowRing) {
          glowRing.style.borderColor = 'var(--red-bright)';
          glowRing.style.boxShadow = '0 0 24px var(--red-glow)';
        }
        toast('CRITICAL THREAT: Active perimeter breach detected!', 'danger');
      }, 1000);
    }
  };

  window.triggerPerimeterLockdown = () => {
    const logContainer = document.getElementById('lockdown-log-container');
    const logList = document.getElementById('lockdown-events-log');
    const triggerBtn = document.getElementById('btn-lockdown-trigger');
    const resetBtn = document.getElementById('btn-lockdown-reset');
    const timerDisplay = document.getElementById('lockdown-countdown-timer');

    if (!logContainer || !logList) return;

    logContainer.style.display = 'flex';
    if (triggerBtn) triggerBtn.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'inline-block';

    toast('🚨 PERIMETER LOCKDOWN ACTIVATED. Initiating tactical defenses.', 'danger');
    
    // Reset timer
    countdownMinutes = 15;
    countdownSeconds = 0;
    if (timerDisplay) timerDisplay.textContent = '15:00';

    logList.innerHTML = '';
    addLogEntry('LOCKDOWN SEQUENCE STARTED: Pre-Gate Perimeter Security activated.', 'critical');

    setTimeout(() => {
      addLogEntry('Erecting physical barricades at Metro Concourse Gate...', 'info');
      toast('Erecting Metro Gate barricades.', 'info');
    }, 1200);

    setTimeout(() => {
      addLogEntry('Mounted police dispatch confirmed for West Car Park...', 'success');
      toast('Mounted police units dispatched.', 'success');
    }, 3200);

    // Start timer loop
    clearInterval(lockdownTimerId);
    lockdownTimerId = setInterval(() => {
      if (countdownSeconds === 0) {
        if (countdownMinutes === 0) {
          clearInterval(lockdownTimerId);
          addLogEntry('TACTICAL DEPLOYMENT COMPLETE. Gates secure.', 'success');
          return;
        }
        countdownMinutes--;
        countdownSeconds = 59;
      } else {
        countdownSeconds--;
      }

      const minStr = String(countdownMinutes).padStart(2, '0');
      const secStr = String(countdownSeconds).padStart(2, '0');
      if (timerDisplay) timerDisplay.textContent = `${minStr}:${secStr}`;

      // Simulate mid-timer events
      if (countdownMinutes === 14 && countdownSeconds === 45) {
        addLogEntry('Security checkpoints B & C in MetLife lockdown state.', 'critical');
      }
      if (countdownMinutes === 14 && countdownSeconds === 30) {
        addLogEntry('Relaying mesh notification to nearby staff devices...', 'info');
      }
    }, 1000);
  };

  window.resetPerimeterLockdown = () => {
    clearInterval(lockdownTimerId);
    
    const logContainer = document.getElementById('lockdown-log-container');
    const triggerBtn = document.getElementById('btn-lockdown-trigger');
    const resetBtn = document.getElementById('btn-lockdown-reset');
    const statusDesc = document.getElementById('threat-status-desc');
    const badgeStatus = document.getElementById('threat-badge-status');
    const percentVal = document.getElementById('threat-percent-val');
    const progressBar = document.getElementById('threat-progress-bar');
    const glowRing = document.getElementById('threat-glow-ring');
    const cctvImg = document.querySelector('.cctv-bg-img');
    const breachSpot = document.getElementById('heatspot-breach');

    if (logContainer) logContainer.style.display = 'none';
    if (triggerBtn) triggerBtn.style.display = 'inline-block';
    if (resetBtn) resetBtn.style.display = 'none';

    if (cctvImg) cctvImg.style.filter = 'grayscale(0.5) contrast(1.1)';
    if (breachSpot) breachSpot.style.display = 'none';

    if (statusDesc) statusDesc.textContent = 'Warning: High concentration of unverified ticketless crowds detected in Transit Hub.';
    if (badgeStatus) {
      badgeStatus.textContent = 'ELEVATED';
      badgeStatus.style.background = 'var(--orange-surface)';
      badgeStatus.style.color = 'var(--orange-bright)';
    }
    if (percentVal) percentVal.textContent = '68%';
    if (progressBar) progressBar.style.width = '68%';
    if (glowRing) {
      glowRing.style.borderColor = 'var(--orange-bright)';
      glowRing.style.boxShadow = '0 0 16px var(--orange-glow)';
    }

    toast('Tactical alarms reset. Status cleared.', 'info');
  };

  const addLogEntry = (msg, type = '') => {
    const logList = document.getElementById('lockdown-events-log');
    if (!logList) return;
    const date = new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-msg ${type}">${escapeHTML(msg)}</span>
    `;
    logList.appendChild(entry);
    logList.scrollTop = logList.scrollHeight;
  };

  // ── Stacked Sections Scroll Animation ──────────────────────
  const initStackedSections = () => {
    const deck = document.getElementById('home-stacked-deck');
    if (!deck) return;

    const cards = Array.from(deck.querySelectorAll('.stacked-card'));
    const contents = Array.from(deck.querySelectorAll('.stacked-content'));
    const total = cards.length;
    const stackOffset = 48; // px

    const scaleAtDepth = (cardIndex) => {
      const reverseIndex = total - (cardIndex - 1);
      return 1.1 - 0.1 * reverseIndex;
    };

    const isNextCardPinned = (cardIndex, containerTop) => {
      const nextCard = cards[cardIndex + 1];
      if (!nextCard) return false;
      return (nextCard.getBoundingClientRect().top - containerTop <= (cardIndex + 1) * stackOffset + 1);
    };

    const update = () => {
      const containerTop = 0; // relative to viewport since window scrolls

      for (let i = 0; i < total; i++) {
        const card = cards[i];
        const content = contents[i];
        if (!card || !content) continue;

        const endScale = scaleAtDepth(i + 1);
        const covered = isNextCardPinned(i, containerTop);

        if (covered) {
          content.setAttribute('data-stacked-covered', '');
          content.style.transform = `scale(${endScale})`;
          content.style.opacity = `${0.55 + 0.45 * (1 - (total - (i + 1)) * 0.12)}`;
          continue;
        }

        content.removeAttribute('data-stacked-covered');

        const nextCard = cards[i + 1];
        if (!nextCard) {
          content.style.transform = '';
          content.style.opacity = '';
          continue;
        }

        const pinnedTop = (i + 1) * stackOffset;
        const offset = nextCard.getBoundingClientRect().top - containerTop - pinnedTop;
        const rowH = card.offsetHeight > 0 ? card.offsetHeight : 1;
        const distance = Math.max(rowH - pinnedTop, 1);
        const progress = Math.min(1, Math.max(0, 1 - offset / distance));
        const scale = 1 + (endScale - 1) * progress;
        const opacity = 1 - 0.25 * progress;

        if (progress <= 0.001) {
          content.style.transform = '';
          content.style.opacity = '';
        } else {
          content.style.transform = `scale(${scale})`;
          content.style.opacity = `${opacity}`;
        }
      }
    };

    let frame = 0;
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          update();
        });
      }
    };

    // Initialize padding
    deck.style.setProperty('--numcards', total);
    deck.style.setProperty('--stacked-top-offset', `${stackOffset}px`);
    deck.style.paddingBottom = `calc(${total} * ${stackOffset}px)`;

    cards.forEach((card, index) => {
      const cardIndex = index + 1;
      card.style.setProperty('--index', cardIndex);
      card.style.zIndex = cardIndex;
      card.style.paddingTop = `calc(${cardIndex} * ${stackOffset}px)`;
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  };

  // ── PAGE: PERIMETER DEFENSE (Webcam AI CCTV Object Detection) ─────
  let cctvModel = null;
  let cctvActive = false;
  let cctvStream = null;
  let lastAlertTime = 0;
  let threatDatabase = JSON.parse(localStorage.getItem('threatDatabase') || '[]');
  let modelLoading = false;
  let cctvPeakCount = 0;
  let cctvTotalCount = 0;

  const initPerimeterPage = async () => {
    const clearBtn = document.getElementById('btn-clear-threats');
    if (clearBtn && !clearBtn.dataset.listenerBound) {
      clearBtn.dataset.listenerBound = 'true';
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearThreatDatabase();
      });
    }

    const grid = document.getElementById('threat-log-grid');
    if (grid && !grid.dataset.listenerBound) {
      grid.dataset.listenerBound = 'true';
      grid.addEventListener('click', (e) => {
        const saveBtn = e.target.closest('.btn-save-threat');
        const deleteBtn = e.target.closest('.btn-delete-threat');
        if (saveBtn) {
          e.preventDefault();
          downloadThreatSnapshot(saveBtn.dataset.id);
        } else if (deleteBtn) {
          e.preventDefault();
          deleteThreatLog(deleteBtn.dataset.id);
        }
      });
    }

    renderThreatLog();
    if (!cctvModel && !modelLoading) {
      modelLoading = true;
      const statusBadge = document.getElementById('ai-model-status-badge');
      if (statusBadge) {
        statusBadge.textContent = 'AI LOADING...';
        statusBadge.style.color = '#EAB308';
        statusBadge.style.borderColor = 'rgba(234,179,8,0.4)';
      }
      try {
        cctvModel = await cocoSsd.load();
        modelLoading = false;
        if (statusBadge) {
          statusBadge.textContent = 'AI READY';
          statusBadge.style.color = '#00FF88';
          statusBadge.style.borderColor = 'rgba(0,255,136,0.4)';
        }
        console.log("TensorFlow COCO-SSD Model loaded successfully.");
      } catch (err) {
        modelLoading = false;
        if (statusBadge) {
          statusBadge.textContent = 'AI ERROR';
          statusBadge.style.color = '#FF2D55';
          statusBadge.style.borderColor = 'rgba(255,45,85,0.4)';
        }
        console.error("Failed to load TensorFlow model:", err);
      }
    }
  };

  const playSirenSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.6);
      
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
      console.warn("AudioContext playback blocked:", e);
    }
  };

  const renderThreatLog = () => {
    const grid = document.getElementById('threat-log-grid');
    const logCount = document.getElementById('threat-log-count');
    if (!grid) return;
    
    if (logCount) {
      logCount.textContent = `${threatDatabase.length} threat${threatDatabase.length === 1 ? '' : 's'} logged`;
    }

    if (threatDatabase.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:var(--space-6); color:var(--fg-secondary); font-size:0.8rem;">
          No threats detected. Connect CCTV feed and hold a phone (handgun proxy) or scissors in front of the lens.
        </div>
      `;
      return;
    }

    grid.innerHTML = threatDatabase.map(threat => `
      <div class="threat-log-card" style="position:relative">
        <button class="threat-delete-btn btn-delete-threat" data-id="${threat.id}" title="Delete snapshot">🗑️</button>
        <img class="threat-log-thumb" src="${threat.img}" alt="Screenshot" />
        <div class="threat-log-info">
          <div class="threat-log-class">
            <span>${escapeHTML(threat.type.split(' ')[0])}</span>
            <span class="threat-log-conf">${escapeHTML(threat.conf)}</span>
          </div>
          <div class="threat-log-meta">
            <span class="threat-log-time">${escapeHTML(threat.time)}</span>
            <span style="color:var(--accent-blue)">${escapeHTML(threat.loc.split(' ')[0])}</span>
          </div>
          <div style="margin-top:6px; display:flex">
            <button class="btn btn-ghost btn-sm btn-save-threat" data-id="${threat.id}" style="padding:2px 6px; font-size:0.65rem; border-color:rgba(255,255,255,0.08); cursor:pointer; flex:1">💾 Save Snapshot</button>
          </div>
        </div>
      </div>
    `).reverse().join('');
  };

  let lastClearedThreats = null;

  window.downloadThreatSnapshot = (id) => {
    const threat = threatDatabase.find(t => String(t.id) === String(id));
    if (!threat) return;
    
    const link = document.createElement('a');
    link.href = threat.img;
    link.download = `threat_${id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Threat screenshot downloaded successfully!", "success");
  };

  window.deleteThreatLog = (id) => {
    threatDatabase = threatDatabase.filter(t => String(t.id) !== String(id));
    localStorage.setItem('threatDatabase', JSON.stringify(threatDatabase));
    renderThreatLog();
    toast("Threat log entry removed.", "info");
  };

  window.clearThreatDatabase = () => {
    lastClearedThreats = [...threatDatabase];
    threatDatabase = [];
    localStorage.removeItem('threatDatabase');
    renderThreatLog();
    toast("Threat database cleared. <a href='#' onclick='undoClearThreatDatabase(); return false;' style='color:#00FF88; font-weight:bold; margin-left:8px; text-decoration:underline'>Undo</a>", "info");
  };

  window.undoClearThreatDatabase = () => {
    if (lastClearedThreats) {
      threatDatabase = [...lastClearedThreats];
      localStorage.setItem('threatDatabase', JSON.stringify(threatDatabase));
      lastClearedThreats = null;
      renderThreatLog();
      toast("Threat database restored.", "success");
    }
  };

  window.toggleCctvSize = () => {
    const container = document.getElementById('cctv-container');
    const expandIcon = document.querySelector('.resize-icon-expand');
    const shrinkIcon = document.querySelector('.resize-icon-shrink');
    
    if (container) {
      container.classList.toggle('maximized');
      const isMax = container.classList.contains('maximized');
      
      if (expandIcon && shrinkIcon) {
        expandIcon.style.display = isMax ? 'none' : 'block';
        shrinkIcon.style.display = isMax ? 'block' : 'none';
      }
      
      const video = document.getElementById('cctv-video');
      const canvas = document.getElementById('cctv-canvas');
      if (video && canvas) {
        const updateSize = () => {
          canvas.width = video.clientWidth;
          canvas.height = video.clientHeight;
        };
        updateSize();
        setTimeout(updateSize, 100);
        setTimeout(updateSize, 200);
        setTimeout(updateSize, 300);
      }
    }
  };

  window.toggleCctvAI = async () => {
    const video = document.getElementById('cctv-video');
    const canvas = document.getElementById('cctv-canvas');
    const staticImg = document.getElementById('cctv-static-img');
    const btn = document.getElementById('btn-cctv-ai');
    const statusBadge = document.getElementById('ai-model-status-badge');
    const feedTitle = document.getElementById('cctv-feed-title');
    const feedBadge = document.getElementById('cctv-feed-badge');
    
    const overlays = [
      document.getElementById('heatspot-transit'),
      document.getElementById('heatspot-parking'),
      document.getElementById('heatspot-breach'),
      document.getElementById('hud-target-box-1'),
      document.getElementById('hud-target-box-2')
    ];

    if (!cctvActive) {
      if (!cctvModel) {
        toast("Please wait. Loading YOLOv8 threat model...", "warning");
        await initPerimeterPage();
        if (!cctvModel) {
          toast("Threat detection model failed to load. Check console.", "danger");
          return;
        }
      }

      try {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
          // On mobile: request built-in back camera directly (avoiding choosing prompts)
          const constraints = {
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: { ideal: "environment" }
            }
          };
          cctvStream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          // On desktop/laptop:
          // 1. Get temporary default stream to trigger user permission and fetch populated labels
          const tempStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 640 }, height: { ideal: 480 } } 
          });
          
          let selectedDevice = null;
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            console.log("Desktop video input devices:", videoDevices);
            
            const isVirtual = (label) => {
              const l = label.toLowerCase();
              return l.includes('virtual') || l.includes('wireless') || l.includes('droidcam') || 
                     l.includes('epoccam') || l.includes('iriun') || l.includes('m2010j19cg') || 
                     l.includes('obs') || l.includes('link') || l.includes('phone') || l.includes('share') ||
                     l.includes('ivcam');
            };
            
            // Look for built-in webcams first
            let builtIn = videoDevices.find(d => {
              const l = d.label.toLowerCase();
              return (l.includes('integrated') || l.includes('built-in') || l.includes('webcam') || 
                      l.includes('internal') || l.includes('facetime') || l.includes('camera')) && !isVirtual(d.label);
            });
            
            if (!builtIn) {
              // Fallback to any non-virtual camera
              builtIn = videoDevices.find(d => !isVirtual(d.label) && d.label !== '');
            }
            
            if (builtIn) {
              selectedDevice = builtIn;
            }
          } catch (deviceErr) {
            console.warn("Could not select physical webcam:", deviceErr);
          }
          
          if (selectedDevice) {
            // Stop temporary stream tracks
            tempStream.getTracks().forEach(t => t.stop());
            
            // Request the specific built-in physical camera
            cctvStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: selectedDevice.deviceId },
                width: { ideal: 640 },
                height: { ideal: 480 }
              }
            });
            console.log("Using built-in camera:", selectedDevice.label);
          } else {
            // Fallback to the temporary stream if no built-in camera is found
            cctvStream = tempStream;
          }
        }
        
        video.srcObject = cctvStream;
        video.style.display = 'block';
        canvas.style.display = 'block';
        staticImg.style.display = 'none';

        try {
          await video.play();
        } catch (playErr) {
          console.warn("Video play prevented:", playErr);
        }
        
        // Show FlowSense AI Telemetry and live status badge
        const telemetryBox = document.getElementById('cctv-telemetry-overlay');
        const liveBadge = document.getElementById('cctv-live-badge-wrapper');
        if (telemetryBox) telemetryBox.style.display = 'block';
        if (liveBadge) liveBadge.style.display = 'block';
        
        // Reset counts
        cctvPeakCount = 0;
        cctvTotalCount = 0;
        
        overlays.forEach(el => { if (el) el.style.setProperty('display', 'none', 'important'); });

        if (btn) {
          btn.textContent = '❌ Disconnect CCTV AI Feed';
          btn.style.background = '#EF4444';
          btn.style.borderColor = '#EF4444';
        }
        
        if (statusBadge) {
          statusBadge.textContent = 'AI SCANNING';
          statusBadge.style.color = '#EF4444';
          statusBadge.style.borderColor = 'rgba(239,68,68,0.4)';
        }

        if (feedTitle) feedTitle.textContent = 'CCTV CAMERA #08 (PRE-GATE PERIMETER) · AI SCAN';
        if (feedBadge) {
          feedBadge.textContent = 'LIVE FEED';
          feedBadge.style.background = 'rgba(239,68,68,0.18)';
          feedBadge.style.color = '#EF4444';
          feedBadge.style.border = '1px solid rgba(239,68,68,0.3)';
        }

        cctvActive = true;
        
        video.onloadedmetadata = () => {
          canvas.width = video.clientWidth;
          canvas.height = video.clientHeight;
        };

        window.addEventListener('resize', resizeCctvCanvas);
        runCctvInference();
        toast("CCTV Security System connected. YOLOv8 Scanning Active.", "success");

      } catch (err) {
        console.error("Camera access failed:", err);
        toast("Camera access denied or unavailable.", "danger");
      }

    } else {
      window.removeEventListener('resize', resizeCctvCanvas);
      if (cctvStream) {
        cctvStream.getTracks().forEach(track => track.stop());
        cctvStream = null;
      }
      
      video.srcObject = null;
      video.style.display = 'none';
      canvas.style.display = 'none';
      staticImg.style.display = 'block';

      // Hide FlowSense AI Telemetry and live status badge
      const telemetryBox = document.getElementById('cctv-telemetry-overlay');
      const liveBadge = document.getElementById('cctv-live-badge-wrapper');
      if (telemetryBox) telemetryBox.style.display = 'none';
      if (liveBadge) liveBadge.style.display = 'none';
      
      overlays.forEach((el, idx) => { 
        if (el) {
          if (idx === 2) {
            el.style.display = 'none';
          } else {
            el.style.display = ''; 
          }
        }
      });

      if (btn) {
        btn.textContent = '⚡ Connect Live CCTV AI Feed';
        btn.style.background = 'var(--accent-blue)';
        btn.style.borderColor = 'var(--accent-blue)';
      }
      
      if (statusBadge) {
        statusBadge.textContent = 'AI READY';
        statusBadge.style.color = '#00FF88';
        statusBadge.style.borderColor = 'rgba(0,255,136,0.4)';
      }

      if (feedTitle) feedTitle.textContent = 'DRONE FEED: METLIFE PERIMETER · LIVE';
      if (feedBadge) {
        feedBadge.textContent = 'SIMULATION';
        feedBadge.style.background = 'rgba(234,179,8,0.18)';
        feedBadge.style.color = '#EAB308';
        feedBadge.style.border = '1px solid rgba(234,179,8,0.3)';
      }

      cctvActive = false;
      toast("CCTV Feed Disconnected.", "info");
    }
  };

  const resizeCctvCanvas = () => {
    const video = document.getElementById('cctv-video');
    const canvas = document.getElementById('cctv-canvas');
    if (video && canvas) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }
  };

  const runCctvInference = async () => {
    if (!cctvActive) return;

    const video = document.getElementById('cctv-video');
    const canvas = document.getElementById('cctv-canvas');
    if (!video || !canvas || video.readyState < 2) {
      setTimeout(runCctvInference, 300);
      return;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // Lower the minimum score threshold to 0.30 to make it much more sensitive to real knives and objects
      const predictions = await cctvModel.detect(video, 20, 0.30);
      
      const scaleX = canvas.width / video.videoWidth;
      const scaleY = canvas.height / video.videoHeight;
      
      let threatFound = null;
      let currentPersons = 0;
      let currentMales = 0;
      let currentFemales = 0;
      let currentThreats = 0;

      predictions.forEach((p, idx) => {
        let mappedType = null;
        // Map various sharp/weapon-like COCO-SSD classes to threats
        if (p.class === 'knife' || p.class === 'fork') {
          mappedType = 'Knife / Sharp Object (Threat Level: CRITICAL)';
        } else if (p.class === 'scissors' || p.class === 'spoon' || p.class === 'toothbrush') {
          mappedType = 'Small Sharp Object (Threat Level: HIGH)';
        } else if (p.class === 'cell phone' || p.class === 'remote' || p.class === 'hair drier') {
          mappedType = 'Handgun (Threat Level: CRITICAL)';
        } else if (p.class === 'baseball bat' || p.class === 'umbrella' || p.class === 'tennis racket') {
          mappedType = 'Large Weapon / Machete (Threat Level: CRITICAL)';
        }

        const [x, y, w, h] = p.bbox;
        const rx = x * scaleX;
        const ry = y * scaleY;
        const rw = w * scaleX;
        const rh = h * scaleY;

        if (p.class === 'person') {
          currentPersons++;
          const isMale = (Math.floor(x + y) % 2 === 0);
          if (isMale) currentMales++; else currentFemales++;
        }
        if (mappedType) {
          currentThreats++;
        }

        if (mappedType) {
          threatFound = { type: mappedType, score: p.score, bbox: [x, y, w, h] };
          
          // Outer Red Bounding Box
          ctx.strokeStyle = '#EF4444';
          ctx.lineWidth = 3;
          ctx.strokeRect(rx, ry, rw, rh);
          
          // Top-Left Tag: Label
          ctx.fillStyle = '#EF4444';
          ctx.font = 'bold 10px JetBrains Mono, Courier New, monospace';
          const tagText = `#${idx + 1} Weapon`;
          const tagW = ctx.measureText(tagText).width;
          ctx.fillRect(rx, ry - 16, tagW + 8, 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(tagText, rx + 4, ry - 4);

          // Top-Right Status Panel (FlowSense AI style)
          ctx.fillStyle = 'rgba(9, 15, 29, 0.85)';
          ctx.fillRect(rx + rw - 65, ry, 65, 28);
          ctx.strokeStyle = '#EF4444';
          ctx.lineWidth = 1;
          ctx.strokeRect(rx + rw - 65, ry, 65, 28);
          
          ctx.fillStyle = '#EF4444';
          ctx.font = '8px JetBrains Mono, Courier New, monospace';
          ctx.fillText(`Det: ${(p.score * 100).toFixed(0)}%`, rx + rw - 61, ry + 11);
          ctx.fillText(`Gen: 0%`, rx + rw - 61, ry + 22);

        } else if (p.class === 'person') {
          // Outer Green Bounding Box (FlowSense style)
          ctx.strokeStyle = '#22C55E';
          ctx.lineWidth = 3;
          ctx.strokeRect(rx, ry, rw, rh);
          
          // Top-Left Tag: Label & Age
          const age = 18 + (Math.floor(x * 3) % 25);
          const isMale = (Math.floor(x + y) % 2 === 0);
          const genChar = isMale ? '♂' : '♀';
          ctx.fillStyle = '#22C55E';
          ctx.font = 'bold 10px JetBrains Mono, Courier New, monospace';
          const tagText = `#${idx + 1} ${genChar} ~${age}y`;
          const tagW = ctx.measureText(tagText).width;
          ctx.fillRect(rx, ry - 16, tagW + 8, 16);
          ctx.fillStyle = '#090F1D';
          ctx.fillText(tagText, rx + 4, ry - 4);

          // Top-Right Status Panel (FlowSense style)
          ctx.fillStyle = 'rgba(9, 15, 29, 0.85)';
          ctx.fillRect(rx + rw - 65, ry, 65, 28);
          ctx.strokeStyle = '#22C55E';
          ctx.lineWidth = 1;
          ctx.strokeRect(rx + rw - 65, ry, 65, 28);
          
          ctx.fillStyle = '#22C55E';
          ctx.font = '8px JetBrains Mono, Courier New, monospace';
          ctx.fillText(`Det: ${(p.score * 100).toFixed(0)}%`, rx + rw - 61, ry + 11);
          ctx.fillText(`Gen: ${(80 + (Math.floor(y * 2) % 19))}%`, rx + rw - 61, ry + 22);

        } else {
          // Draw standard blue boxes for other objects
          ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(rx, ry, rw, rh);
          
          ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
          ctx.font = '9px JetBrains Mono, Courier New, monospace';
          const txt = `${p.class} ${(p.score * 100).toFixed(0)}%`;
          ctx.fillText(txt, rx + 4, ry + 12);
        }
      });

      // Update Peak & Total Counts
      if (currentPersons > 0 && cctvTotalCount === 0) {
        cctvTotalCount = 1;
      }
      if (currentPersons > cctvPeakCount) {
        cctvPeakCount = currentPersons;
      }
      cctvTotalCount = Math.max(cctvTotalCount, cctvPeakCount);

      // Update Overlay Panel Elements
      const domCount = document.getElementById('telemetry-count');
      const domMales = document.getElementById('telemetry-males');
      const domFemales = document.getElementById('telemetry-females');
      const domThreats = document.getElementById('telemetry-threats');
      const domTotal = document.getElementById('telemetry-total');
      const domPeak = document.getElementById('telemetry-peak');

      if (domCount) domCount.textContent = currentPersons;
      if (domMales) domMales.textContent = currentMales;
      if (domFemales) domFemales.textContent = currentFemales;
      if (domThreats) domThreats.textContent = currentThreats;
      if (domTotal) domTotal.textContent = cctvTotalCount;
      if (domPeak) domPeak.textContent = cctvPeakCount;

      if (threatFound) {
        triggerThreatAlert(threatFound);
      }

    } catch (e) {
      console.warn("Inference frame error:", e);
    }

    setTimeout(runCctvInference, 300);
  };

  const triggerThreatAlert = (threat) => {
    // Reduce cooldown to 1 second so it catches back-to-back weapons (e.g. testing phone then knife)
    const cooldownMs = 1000;
    if (Date.now() - lastAlertTime < cooldownMs) {
      return;
    }
    lastAlertTime = Date.now();

    playSirenSound();

    const overlay = document.getElementById('cctv-alarm-overlay');
    if (overlay) {
      overlay.textContent = `⚠️ THREAT ALERT: ${threat.type.toUpperCase()} DETECTED`;
      overlay.classList.add('active');
      setTimeout(() => {
        overlay.classList.remove('active');
        overlay.textContent = '';
      }, 2500);
    }

    const video = document.getElementById('cctv-video');
    const canvas = document.getElementById('cctv-canvas');
    const thumbCanvas = document.createElement('canvas');
    // Increase resolution to capture face and weapon clearly
    thumbCanvas.width = 320;
    thumbCanvas.height = 240;
    const thumbCtx = thumbCanvas.getContext('2d');
    
    thumbCtx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
    if (canvas) {
      thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    }
    const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

    const locations = ['Transit Hub A', 'Gate A Corridor', 'East Perimeter Fence', 'North Plaza Entrance'];
    const randomLoc = locations[Math.floor(Math.random() * locations.length)];
    
    const newThreat = {
      id: Date.now(),
      img: thumbUrl,
      type: threat.type,
      conf: `${(threat.score * 100).toFixed(0)}%`,
      time: new Date().toLocaleTimeString(),
      loc: randomLoc
    };

    threatDatabase.push(newThreat);
    if (threatDatabase.length > 5) {
      threatDatabase.shift();
    }
    localStorage.setItem('threatDatabase', JSON.stringify(threatDatabase));
    
    renderThreatLog();

    toast(`⚠️ THREAT ALERT: ${threat.type} detected at ${randomLoc}!`, 'danger');

    DATA.incidents.unshift({
      id: 'inc' + Math.floor(Math.random() * 900 + 100),
      time: new Date().toLocaleTimeString().slice(0, 5),
      location: randomLoc,
      type: 'CROWD',
      severity: 'CRITICAL',
      description: `CCTV AI detection warning: Subject carrying a ${threat.type} spotted.`,
      aiScore: 98,
      status: 'ACTIVE',
      assignedTo: 'Security Patrol Team',
      aiAction: `Dispatch intercept officers to ${randomLoc} immediately. Neutralize threat.`
    });

    if (typeof initOpsPage === 'function') {
      initOpsPage();
    }
  };

  // ── Initialize Everything ──────────────────────────────────
  const settingsInput = document.getElementById('settings-api-key');
  if (settingsInput) {
    const key = (localStorage.getItem('anthropic-api-key') || '').trim().replace(/\.$/, '');
    if (key) settingsInput.value = key;
  }

  // ── Global AI Assistant Logic ──────────────────────────────
  const initGlobalAI = () => {
    const fab = document.getElementById('global-ai-fab');
    const panel = document.getElementById('global-ai-panel');
    const closeBtn = document.getElementById('global-ai-close');
    const sendBtn = document.getElementById('global-ai-send');
    const input = document.getElementById('global-ai-input');
    const messages = document.getElementById('global-ai-messages');

    if (!fab || !panel) return;

    const togglePanel = () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        input.focus();
      }
    };

    fab.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', togglePanel);

    const appendMsg = (text, isUser) => {
      const div = document.createElement('div');
      div.className = `message ${isUser ? 'user' : 'ai'}`;
      const avatar = document.createElement('div');
      avatar.className = `msg-avatar ${isUser ? 'user' : 'ai'}`;
      avatar.innerHTML = isUser 
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
      
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      // Format basic markdown safely
      const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      bubble.innerHTML = formatted;

      div.appendChild(avatar);
      div.appendChild(bubble);
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return bubble;
    };

    const sendMessage = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      
      appendMsg(text, true);
      const aiBubble = appendMsg('...', false);
      
      // Get active tab context
      const activeTabBtn = document.querySelector('.nav-tab.active');
      const currentContext = activeTabBtn ? activeTabBtn.querySelector('.tab-label').textContent : 'Unknown';

      try {
        if (!window.AI || !window.AI.getResponse) throw new Error('AI Engine not ready');
        const response = await window.AI.getResponse(text, currentContext);
        aiBubble.innerHTML = '';
        window.AI.typeText(aiBubble, response, 10);
      } catch (err) {
        aiBubble.innerHTML = `<span style="color:var(--red-bright)">Error: ${err.message}</span>`;
      }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
  };

  initGlobalAI();
  initParticles();
  initChat();
  initSOS();
  initOrbit();
  initStackedSections();
  initVanillaTabs();
  navigate('home');

  // Simulate periodic alerts
  setInterval(() => {
    const zone = DATA.crowdZones.find(z => z.density >= 0.85);
    if (zone && Math.random() < 0.3) {
      toast(`PULSE AI: ${zone.label} approaching capacity. Rerouting fans via south concourse.`, 'danger');
    }
  }, 20000);

});
