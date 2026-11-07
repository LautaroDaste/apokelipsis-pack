// Nombres en español para mostrar las opciones de Minecraft de forma entendible.
window.NOMBRES = {
  opciones: {
    renderDistance: 'Distancia de renderizado (chunks)',
    simulationDistance: 'Distancia de simulación (chunks)',
    graphicsMode: 'Gráficos (0 rápidos · 1 detallados · 2 increíbles)',
    maxFps: 'FPS máximos (260 = ilimitados)',
    enableVsync: 'Sincronización vertical (VSync)',
    guiScale: 'Tamaño de la interfaz (0 = automático)',
    fov: 'Campo de visión (0 = 70 · 1 = 110)',
    fovEffectScale: 'Efecto de velocidad en la visión',
    gamma: 'Brillo',
    particles: 'Partículas (0 todas · 1 menos · 2 mínimas)',
    mipmapLevels: 'Niveles de mipmap',
    biomeBlendRadius: 'Transición de biomas',
    entityDistanceScaling: 'Distancia de entidades',
    entityShadows: 'Sombras de entidades',
    renderClouds: 'Nubes ("true", "fast" o "false")',
    ao: 'Iluminación suave',
    fullscreen: 'Pantalla completa',
    prioritizeChunkUpdates: 'Prioridad de actualización de chunks',
    screenEffectScale: 'Efectos de distorsión',
    darknessEffectScale: 'Pulso de oscuridad',
    glintSpeed: 'Velocidad del brillo de encantamientos',
    glintStrength: 'Intensidad del brillo de encantamientos',
    menuBackgroundBlurriness: 'Desenfoque del fondo de los menús',
    bobView: 'Balanceo de la cámara al caminar',
    hideLightningFlashes: 'Ocultar destellos de rayos',
    highContrast: 'Alto contraste',
    damageTiltStrength: 'Inclinación al recibir daño',
    mouseSensitivity: 'Sensibilidad del mouse',
    mouseWheelSensitivity: 'Sensibilidad de la rueda',
    rawMouseInput: 'Entrada directa del mouse',
    invertYMouse: 'Invertir mouse',
    discrete_mouse_scroll: 'Desplazamiento por pasos',
    autoJump: 'Salto automático',
    toggleCrouch: 'Agacharse: alternar (en vez de mantener)',
    toggleSprint: 'Correr: alternar (en vez de mantener)',
    lang: 'Idioma',
    chatVisibility: 'Chat visible (0 sí · 1 solo comandos · 2 no)',
    chatOpacity: 'Opacidad del chat',
    chatScale: 'Tamaño del chat',
    chatWidth: 'Ancho del chat',
    chatHeightFocused: 'Alto del chat (abierto)',
    chatHeightUnfocused: 'Alto del chat (cerrado)',
    chatLineSpacing: 'Interlineado del chat',
    chatDelay: 'Retraso del chat',
    chatColors: 'Colores en el chat',
    chatLinks: 'Enlaces en el chat',
    chatLinksPrompt: 'Preguntar antes de abrir enlaces',
    textBackgroundOpacity: 'Fondo del texto',
    backgroundForChatOnly: 'Fondo solo para el chat',
    autoSuggestions: 'Sugerencias de comandos',
    showSubtitles: 'Subtítulos',
    directionalAudio: 'Audio direccional',
    narrator: 'Narrador',
    pauseOnLostFocus: 'Pausar al cambiar de ventana',
    advancedItemTooltips: 'Información avanzada de objetos (F3+H)',
    mainHand: 'Mano principal',
    attackIndicator: 'Indicador de ataque',
    hideMatchedNames: 'Ocultar nombres coincidentes',
    showAutosaveIndicator: 'Indicador de autoguardado',
    panoramaScrollSpeed: 'Velocidad del fondo del menú',
    forceUnicodeFont: 'Forzar fuente Unicode',
    reducedDebugInfo: 'Información de depuración reducida',
    darkMojangStudiosBackground: 'Pantalla de carga oscura',
    hideSplashTexts: 'Ocultar frases del menú',
    notificationDisplayTime: 'Duración de las notificaciones',
    soundCategory_master: 'Volumen general',
    soundCategory_music: 'Música',
    soundCategory_record: 'Tocadiscos y bloques musicales',
    soundCategory_weather: 'Clima',
    soundCategory_block: 'Bloques',
    soundCategory_hostile: 'Criaturas hostiles',
    soundCategory_neutral: 'Criaturas pacíficas',
    soundCategory_player: 'Jugadores',
    soundCategory_ambient: 'Ambiente',
    soundCategory_voice: 'Voz',
    modelPart_cape: 'Capa',
    modelPart_jacket: 'Chaqueta',
    modelPart_hat: 'Sombrero',
    modelPart_left_sleeve: 'Manga izquierda',
    modelPart_right_sleeve: 'Manga derecha',
    modelPart_left_pants_leg: 'Pierna izquierda',
    modelPart_right_pants_leg: 'Pierna derecha'
  },
  // Opciones personales que no tiene sentido copiar a todos los jugadores.
  personales: ['lastServer', 'version', 'tutorialStep', 'joinedFirstServer', 'skipMultiplayerWarning', 'skipRealms32bitWarning',
    'onboardAccessibility', 'overrideWidth', 'overrideHeight', 'fullscreenResolution', 'soundDevice', 'hideBundleTutorial', 'realmsNotifications',
    'telemetryOptInExtra', 'debugifyTelemetry'],
  teclas: {
    'key.attack': 'Atacar / romper', 'key.use': 'Usar objeto / colocar', 'key.forward': 'Avanzar', 'key.left': 'Izquierda', 'key.back': 'Retroceder',
    'key.right': 'Derecha', 'key.jump': 'Saltar', 'key.sneak': 'Agacharse', 'key.sprint': 'Correr', 'key.drop': 'Soltar objeto',
    'key.inventory': 'Inventario', 'key.chat': 'Abrir chat', 'key.playerlist': 'Lista de jugadores', 'key.pickItem': 'Elegir bloque',
    'key.command': 'Escribir comando', 'key.socialInteractions': 'Interacciones sociales', 'key.screenshot': 'Captura de pantalla',
    'key.togglePerspective': 'Cambiar cámara', 'key.smoothCamera': 'Cámara cinematográfica', 'key.fullscreen': 'Pantalla completa',
    'key.spectatorOutlines': 'Resaltar jugadores (espectador)', 'key.swapOffhand': 'Cambiar a la otra mano',
    'key.saveToolbarActivator': 'Guardar barra (creativo)', 'key.loadToolbarActivator': 'Cargar barra (creativo)',
    'key.advancements': 'Progresos'
  },
  teclasNombre: {
    'key.mouse.left': 'Clic izq.', 'key.mouse.right': 'Clic der.', 'key.mouse.middle': 'Rueda (clic)',
    'key.keyboard.unknown': '— sin asignar —', 'key.keyboard.left.shift': 'Shift izq.', 'key.keyboard.right.shift': 'Shift der.',
    'key.keyboard.left.control': 'Ctrl izq.', 'key.keyboard.right.control': 'Ctrl der.', 'key.keyboard.left.alt': 'Alt izq.',
    'key.keyboard.right.alt': 'Alt der.', 'key.keyboard.space': 'Espacio', 'key.keyboard.tab': 'Tab', 'key.keyboard.enter': 'Enter',
    'key.keyboard.backspace': 'Retroceso', 'key.keyboard.caps.lock': 'Bloq Mayús', 'key.keyboard.grave.accent': 'º / `',
    'key.keyboard.escape': 'Esc', 'key.keyboard.up': '↑', 'key.keyboard.down': '↓', 'key.keyboard.left': '←', 'key.keyboard.right': '→',
    'key.keyboard.page.up': 'Re Pág', 'key.keyboard.page.down': 'Av Pág', 'key.keyboard.insert': 'Insert', 'key.keyboard.delete': 'Supr',
    'key.keyboard.home': 'Inicio', 'key.keyboard.end': 'Fin', 'key.keyboard.left.bracket': '[', 'key.keyboard.right.bracket': ']',
    'key.keyboard.semicolon': ';', 'key.keyboard.apostrophe': "'", 'key.keyboard.comma': ',', 'key.keyboard.period': '.',
    'key.keyboard.slash': '/', 'key.keyboard.backslash': '\\', 'key.keyboard.minus': '-', 'key.keyboard.equal': '='
  },
  // KeyboardEvent.code -> nombre de tecla de Minecraft
  codigo(code) {
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return 'key.keyboard.' + m[1].toLowerCase();
    if ((m = /^Digit(\d)$/.exec(code))) return 'key.keyboard.' + m[1];
    if ((m = /^F(\d{1,2})$/.exec(code))) return 'key.keyboard.f' + m[1];
    if ((m = /^Numpad(\d)$/.exec(code))) return 'key.keyboard.keypad.' + m[1];
    const map = {
      Space: 'space', Tab: 'tab', Enter: 'enter', CapsLock: 'caps.lock', Backquote: 'grave.accent', Minus: 'minus', Equal: 'equal',
      BracketLeft: 'left.bracket', BracketRight: 'right.bracket', Semicolon: 'semicolon', Quote: 'apostrophe', Comma: 'comma',
      Period: 'period', Slash: 'slash', Backslash: 'backslash', IntlBackslash: 'world.2', ShiftLeft: 'left.shift', ShiftRight: 'right.shift',
      ControlLeft: 'left.control', ControlRight: 'right.control', AltLeft: 'left.alt', AltRight: 'right.alt', MetaLeft: 'left.win',
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Insert: 'insert', Delete: 'delete', Home: 'home',
      End: 'end', PageUp: 'page.up', PageDown: 'page.down', NumpadAdd: 'keypad.add', NumpadSubtract: 'keypad.subtract',
      NumpadMultiply: 'keypad.multiply', NumpadDivide: 'keypad.divide', NumpadDecimal: 'keypad.decimal', NumpadEnter: 'keypad.enter',
      ScrollLock: 'scroll.lock', Pause: 'pause', PrintScreen: 'print.screen', NumLock: 'num.lock', ContextMenu: 'menu'
    };
    return map[code] ? 'key.keyboard.' + map[code] : null;
  },
  nombreTecla(v) {
    if (this.teclasNombre[v]) return this.teclasNombre[v];
    let m;
    if ((m = /^key\.mouse\.(\d+)$/.exec(v))) return `Botón ${m[1]} del mouse`;
    if ((m = /^key\.keyboard\.keypad\.(.+)$/.exec(v))) return `Num ${m[1]}`;
    if ((m = /^key\.keyboard\.(.+)$/.exec(v))) return m[1].length <= 3 ? m[1].toUpperCase() : m[1];
    return v;
  }
};
