"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import * as THREE from "three"
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js"
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js"

// Define the structure for web view configurations
interface WebViewConfig {
  iframe: HTMLIFrameElement
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
  originalScale: number
}

export default function ImmersiveDashboard() {
  const mountRef = useRef<HTMLDivElement>(null)
  const cssRendererMountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cssRendererRef = useRef<CSS3DRenderer | null>(null)
  const controlsRef = useRef<PointerLockControls | null>(null)
  const moveRef = useRef({ forward: 0, backward: 0, left: 0, right: 0 })
  const moveSpeed = 3.1
  const clockRef = useRef(new THREE.Clock())
  const raycasterRef = useRef(new THREE.Raycaster())
  const isMobileRef = useRef(false)
  const zoomedObjectRef = useRef<CSS3DObject | null>(null)
  const originalCameraPosRef = useRef(new THREE.Vector3())
  const floorY = 1.6
  const velocityRef = useRef(new THREE.Vector3())
  const acceleration = 30
  const friction = 10
  const moveJoystickRef = useRef({ active: false, vector: new THREE.Vector2(), touchId: null as number | null })
  const lookJoystickRef = useRef({ active: false, vector: new THREE.Vector2(), touchId: null as number | null })
  const webViewObjectsRef = useRef<CSS3DObject[]>([])
  const webViewsConfigRef = useRef<WebViewConfig[]>([]) // To store original config for reset
  const lastTapRef = useRef(0)
  const doubleTapThreshold = 300
  const tapDebounceRef = useRef(false)

  const [infoOpacity, setInfoOpacity] = useState(1)

  const animate = useCallback(() => {
    requestAnimationFrame(animate)
    const delta = Math.min(clockRef.current.getDelta(), 0.1)

    if (!zoomedObjectRef.current) {
      moveCamera(delta)
      if (lookJoystickRef.current.active) {
        if (cameraRef.current) {
          cameraRef.current.rotation.y -= lookJoystickRef.current.vector.x * 0.05
          cameraRef.current.rotation.x = Math.max(
            -Math.PI / 4,
            Math.min(Math.PI / 4, cameraRef.current.rotation.x - lookJoystickRef.current.vector.y * 0.05),
          )
        }
      }
    }

    if (rendererRef.current && cssRendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
      cssRendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }, [])

  const setupScene = useCallback(() => {
    sceneRef.current = new THREE.Scene()
    sceneRef.current.background = new THREE.Color(0x0a0a1a)
    sceneRef.current.fog = new THREE.FogExp2(0x0a0a1a, 0.015)
  }, [])

  const setupCamera = useCallback(() => {
    cameraRef.current = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    cameraRef.current.position.set(0, floorY, 8)
  }, [])

  const setupRenderers = useCallback(() => {
    if (mountRef.current && cssRendererMountRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        alpha: true,
      })
      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      rendererRef.current.setSize(window.innerWidth, window.innerHeight)
      rendererRef.current.toneMapping = THREE.ACESFilmicToneMapping
      rendererRef.current.toneMappingExposure = 1.0
      rendererRef.current.shadowMap.enabled = true
      rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap
      mountRef.current.appendChild(rendererRef.current.domElement)

      cssRendererRef.current = new CSS3DRenderer()
      cssRendererRef.current.setSize(window.innerWidth, window.innerHeight)
      cssRendererRef.current.domElement.style.position = "absolute"
      cssRendererRef.current.domElement.style.top = "0"
      cssRendererRef.current.domElement.style.pointerEvents = "none"
      cssRendererMountRef.current.appendChild(cssRendererRef.current.domElement)
    }
  }, [])

  const setupControls = useCallback(() => {
    if (cameraRef.current && rendererRef.current && sceneRef.current) {
      controlsRef.current = new PointerLockControls(cameraRef.current, rendererRef.current.domElement)
      controlsRef.current.addEventListener("lock", () => {
        setInfoOpacity(0.3)
      })
      controlsRef.current.addEventListener("unlock", () => {
        setInfoOpacity(1)
      })
      sceneRef.current.add(controlsRef.current.getObject())
    }
  }, [])

  const setupEnvironment = useCallback(() => {
    if (sceneRef.current) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50), // Increased size
        new THREE.MeshStandardMaterial({
          color: 0x1c2526,
          roughness: 0.3,
          metalness: 0.6,
        }),
      )
      floor.rotation.x = -Math.PI / 2
      floor.receiveShadow = true
      sceneRef.current.add(floor)

      const ceiling = new THREE.Mesh(
        new THREE.SphereGeometry(25, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2), // Increased size
        new THREE.MeshStandardMaterial({
          color: 0x3a3a4a,
          roughness: 0.5,
          metalness: 0.4,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      )
      ceiling.position.set(0, 8, 0)
      ceiling.rotation.x = Math.PI
      sceneRef.current.add(ceiling)

      const starCount = 200
      const starGeometry = new THREE.BufferGeometry()
      const starPositions = new Float32Array(starCount * 3)
      for (let i = 0; i < starCount * 3; i++) {
        starPositions[i] = (Math.random() - 0.5) * 150
      }
      starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3))
      const starMaterial = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
      })
      const stars = new THREE.Points(starGeometry, starMaterial)
      stars.position.y = 15
      sceneRef.current.add(stars)

      // Glowing Pillars
      const pillarMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff, // Cyan glow
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      })
      const pillarGeometry = new THREE.CylinderGeometry(0.1, 0.1, 6, 16)

      const pillarPositions = [
        [10, 3, -10],
        [-10, 3, -10],
        [10, 3, 10],
        [-10, 3, 10],
        [0, 3, -18],
        [0, 3, 18],
      ]

      pillarPositions.forEach((pos) => {
        const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial)
        pillar.position.set(pos[0], pos[1], pos[2])
        sceneRef.current?.add(pillar)

        const pillarLight = new THREE.PointLight(0x00ffff, 0.5, 5)
        pillarLight.position.copy(pillar.position)
        pillarLight.position.y += 2 // Position light slightly above pillar
        sceneRef.current?.add(pillarLight)
      })
    }
  }, [])

  const setupWebViews = useCallback(() => {
    if (sceneRef.current) {
      const createIframe = (src: string, style: React.CSSProperties = {}) => {
        const iframe = document.createElement("iframe")
        iframe.src = src
        Object.assign(iframe.style, {
          width: "800px",
          height: "600px",
          border: "0",
          borderRadius: "16px",
          boxShadow: "0 0 20px rgba(0,255,255,0.3)",
          pointerEvents: "none",
          transition: "box-shadow 0.3s, transform 0.3s",
          ...style,
        })
        iframe.setAttribute("scrolling", "yes")
        iframe.setAttribute("allow", "autoplay; fullscreen")
        return iframe
      }

      const webViews: WebViewConfig[] = [
        // Blazzy-Verse Hub (Central, prominent)
        {
          iframe: createIframe("https://preview--blazzy-verse-hub.lovable.app/", {
            boxShadow: "0 0 50px rgba(255,255,0,1)", // Very prominent glow
          }),
          position: [0, 4.5, -15], // Further back, slightly higher
          rotation: [0, 0, 0],
          scale: 0.009, // Larger
          originalScale: 0.009,
        },
        // Blazzy Orb (Left-Front)
        {
          iframe: createIframe("https://v0-the-orb-sigma.vercel.app/", {
            boxShadow: "0 0 30px rgba(100,100,255,0.7)",
          }),
          position: [-8, 2.7, -10],
          rotation: [0, 0.5, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
        // Minner Blazzy (Right-Front)
        {
          iframe: createIframe("https://minnerxblazzy1.netlify.app/", {
            boxShadow: "0 0 25px rgba(0,200,255,0.5)",
          }),
          position: [8, 2.7, -10],
          rotation: [0, -0.5, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
        // Intro Blazzy (Entrance/Behind user start)
        {
          iframe: createIframe("https://welcomettmatrix.github.io/BLAZZY-MAIN/", {
            boxShadow: "0 0 30px rgba(150,0,255,0.6)",
          }),
          position: [0, 2.7, 15], // Behind initial camera position
          rotation: [0, Math.PI, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
        // Dexscreener (Left-Mid)
        {
          iframe: createIframe(
            "https://dexscreener.com/cronos/0x5F028F49a7443f34aeDFc19ED986c92243d98EF5?embed=1&loadChartSettings=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15",
          ),
          position: [-12, 2.7, -5],
          rotation: [0, 1.0, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
        // GoPlusLabs (Right-Mid)
        {
          iframe: createIframe("https://gopluslabs.io/token-security/25/0x9ef3fc220867f6cf5655db3d950cda67a3a92f9f", {
            boxShadow: "0 0 20px rgba(0,255,100,0.25)",
          }),
          position: [12, 2.7, -5],
          rotation: [0, -1.0, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
        // Matrix Quantum Terminal (Left-Back)
        {
          iframe: createIframe("https://v0-fork-of-matrix-quantum-terminal-g0jxgv.vercel.app/", {
            boxShadow: "0 0 30px rgba(0,255,150,0.7)",
          }),
          position: [-15, 2.7, 5],
          rotation: [0, 2.0, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
        // Dextools (Right-Back)
        {
          iframe: createIframe(
            "https://www.dextools.io/widget-chart/en/cronos/pe-light/0x5f028f49a7443f34aedfc19ed986c92243d98ef5?theme=light&chartType=2&chartResolution=30&drawingToolbars=false",
          ),
          position: [15, 2.7, 5],
          rotation: [0, -2.0, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
        // Oncyber (Far Left)
        {
          iframe: createIframe("https://oncyber.io/spaces/MWSAvucnK4XFe1Pz4Bho", {
            boxShadow: "0 0 25px rgba(255,0,255,0.5)",
          }),
          position: [-18, 2.7, 0],
          rotation: [0, Math.PI / 2, 0], // Facing right
          scale: 0.007,
          originalScale: 0.007,
        },
        // BlazzyMeta (Far Right)
        {
          iframe: createIframe("https://welcomettmatrix.github.io/BLAZZYMETA/", {
            boxShadow: "0 0 25px rgba(255,165,0,0.5)",
          }),
          position: [18, 2.7, 0],
          rotation: [0, -Math.PI / 2, 0], // Facing left
          scale: 0.007,
          originalScale: 0.007,
        },
        // MetaRoomLaunch (Far Back)
        {
          iframe: createIframe("https://welcomettmatrix.github.io/METAROOMLAUNCH/", {
            boxShadow: "0 0 25px rgba(0,255,255,0.5)",
          }),
          position: [0, 2.7, -18],
          rotation: [0, 0, 0], // Facing back
          scale: 0.007,
          originalScale: 0.007,
        },
        // Metablazzy (Back-Left, slightly elevated)
        {
          iframe: createIframe("https://welcomettmatrix.github.io/metablazzy/", {
            boxShadow: "0 0 25px rgba(255,0,0,0.5)",
          }),
          position: [-10, 4.5, 12],
          rotation: [0, 2.5, 0],
          scale: 0.007,
          originalScale: 0.007,
        },
      ]

      webViewsConfigRef.current = webViews // Store original config

      webViewObjectsRef.current = webViews.map(({ iframe, position, rotation, scale }) => {
        const cssObject = new CSS3DObject(iframe)
        cssObject.position.set(...position)
        cssObject.rotation.set(...rotation)
        cssObject.scale.set(scale, scale, scale)
        sceneRef.current?.add(cssObject)
        return cssObject
      })
    }
  }, [])

  const setupLighting = useCallback(() => {
    if (sceneRef.current) {
      const ambientLight = new THREE.AmbientLight(0x606060, 0.8)
      sceneRef.current.add(ambientLight)

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
      directionalLight.position.set(10, 10, 10)
      directionalLight.castShadow = true
      directionalLight.shadow.mapSize.set(1024, 1024)
      sceneRef.current.add(directionalLight)

      const pointLight = new THREE.PointLight(0x88ccff, 0.4, 20)
      pointLight.position.set(0, 5, -10)
      sceneRef.current.add(pointLight)

      const blueLight = new THREE.PointLight(0x00aaff, 0.3, 15)
      blueLight.position.set(-15, 5, 5)
      sceneRef.current?.add(blueLight)

      const purpleLight = new THREE.PointLight(0xaa00ff, 0.3, 15)
      purpleLight.position.set(15, 5, 5)
      sceneRef.current?.add(purpleLight)

      const greenLight = new THREE.PointLight(0x00ffaa, 0.2, 10)
      greenLight.position.set(0, 2, 10)
      sceneRef.current?.add(greenLight)
    }
  }, [])

  const zoomToWebView = useCallback((cssObject: CSS3DObject) => {
    if (!cameraRef.current || !controlsRef.current) return

    if (zoomedObjectRef.current === cssObject) {
      cssObject.element.style.pointerEvents = "auto"
      return
    }

    originalCameraPosRef.current.copy(cameraRef.current.position)
    const targetPos = cssObject.position.clone()
    targetPos.z += 1.5
    targetPos.y = cssObject.position.y + 0.2

    controlsRef.current.enabled = false
    zoomedObjectRef.current = cssObject

    const originalConfig = webViewsConfigRef.current.find((w) => w.iframe === cssObject.element)
    if (originalConfig) {
      cssObject.scale.setScalar(originalConfig.originalScale * 1.4)
      cssObject.element.style.boxShadow = "0 0 30px rgba(0,255,255,0.5)"
      cssObject.element.style.transform += " translateZ(10px)"
    }

    const duration = 600
    const startTime = Date.now()
    const startPos = cameraRef.current.position.clone()
    const startRot = cameraRef.current.rotation.clone()
    const targetRot = new THREE.Euler(0, cssObject.rotation.y, 0)

    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t)

    const animateZoom = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      const easedT = easeOutQuad(t)

      if (cameraRef.current) {
        cameraRef.current.position.lerpVectors(startPos, targetPos, easedT)
        cameraRef.current.rotation.x = startRot.x + (targetRot.x - startRot.x) * easedT
        cameraRef.current.rotation.y = startRot.y + (targetRot.y - startRot.y) * easedT
      }

      if (t < 1) {
        requestAnimationFrame(animateZoom)
      } else {
        cssObject.element.style.pointerEvents = "auto"
        if (cameraRef.current) {
          cameraRef.current.lookAt(cssObject.position)
        }
      }
    }

    animateZoom()
  }, [])

  const resetZoom = useCallback(() => {
    if (!zoomedObjectRef.current || !cameraRef.current || !controlsRef.current) return

    const duration = 600
    const startTime = Date.now()
    const startPos = cameraRef.current.position.clone()
    const cssObject = zoomedObjectRef.current

    cssObject.element.style.pointerEvents = "none"
    const originalConfig = webViewsConfigRef.current.find((w) => w.iframe === cssObject.element)
    if (originalConfig) {
      cssObject.element.style.boxShadow = originalConfig.iframe.style.boxShadow
      cssObject.element.style.transform = cssObject.element.style.transform.replace(" translateZ(10px)", "")
      cssObject.scale.setScalar(originalConfig.originalScale)
    }

    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t)

    const animateReset = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      const easedT = easeOutQuad(t)

      if (cameraRef.current) {
        cameraRef.current.position.lerpVectors(startPos, originalCameraPosRef.current, easedT)
        // The original code's rotation reset was flawed (using position components for rotation).
        // Re-enabling controls will allow the user to regain control of rotation.
      }

      if (t < 1) {
        requestAnimationFrame(animateReset)
      } else {
        controlsRef.current.enabled = true
        zoomedObjectRef.current = null
      }
    }

    animateReset()
  }, [])

  const moveCamera = useCallback((delta: number) => {
    if (!cameraRef.current || zoomedObjectRef.current) return

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.current.quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRef.current.quaternion)

    const targetVelocity = new THREE.Vector3()
    if (moveRef.current.forward || moveJoystickRef.current.vector.y > 0.1) {
      targetVelocity.add(forward.clone().multiplyScalar(moveRef.current.forward || moveJoystickRef.current.vector.y))
    }
    if (moveRef.current.backward || moveJoystickRef.current.vector.y < -0.1) {
      targetVelocity.sub(forward.clone().multiplyScalar(moveRef.current.backward || -moveJoystickRef.current.vector.y))
    }
    if (moveRef.current.left || moveJoystickRef.current.vector.x < -0.1) {
      targetVelocity.sub(right.clone().multiplyScalar(moveRef.current.left || -moveJoystickRef.current.vector.x))
    }
    if (moveRef.current.right || moveJoystickRef.current.vector.x > 0.1) {
      targetVelocity.add(right.clone().multiplyScalar(moveRef.current.right || moveJoystickRef.current.vector.x))
    }

    targetVelocity.multiplyScalar(moveSpeed)
    velocityRef.current.lerp(targetVelocity, acceleration * delta * 0.5)

    if (targetVelocity.length() < 0.01) {
      velocityRef.current.lerp(new THREE.Vector3(), friction * delta)
    }

    cameraRef.current.position.add(velocityRef.current.clone().multiplyScalar(delta))
    cameraRef.current.position.y = floorY
  }, [])

  const setupDeviceOrientation = useCallback(() => {
    window.addEventListener("deviceorientation", (event) => {
      if (zoomedObjectRef.current || !cameraRef.current) return

      const gamma = event.gamma ? event.gamma * (Math.PI / 180) : 0
      const beta = event.beta ? event.beta * (Math.PI / 180) : 0

      if (cameraRef.current) {
        cameraRef.current.rotation.y = -gamma * 0.5
        cameraRef.current.rotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, beta * 0.5 - Math.PI / 6))
      }
    })
  }, [])

  const handleInteraction = useCallback(
    (event: MouseEvent | TouchEvent, isTouch: boolean) => {
      if (tapDebounceRef.current) return
      tapDebounceRef.current = true
      setTimeout(() => {
        tapDebounceRef.current = false
      }, 100)

      const currentTime = Date.now()
      const isDoubleTap = currentTime - lastTapRef.current < doubleTapThreshold
      lastTapRef.current = currentTime

      if (isTouch) {
        event.preventDefault()
      }

      if (webViewObjectsRef.current.length > 0 && cameraRef.current) {
        const pointer = isTouch
          ? new THREE.Vector2(
              ((event as TouchEvent).touches[0].clientX / window.innerWidth) * 2 - 1,
              -((event as TouchEvent).touches[0].clientY / window.innerHeight) * 2 + 1,
            )
          : new THREE.Vector2(0, 0) // For desktop click, raycast from center

        raycasterRef.current.setFromCamera(pointer, cameraRef.current)
        const intersects = raycasterRef.current.intersectObjects(webViewObjectsRef.current)

        if (intersects.length > 0) {
          const cssObject = intersects[0].object as CSS3DObject
          if (isTouch) {
            if (isDoubleTap) {
              if (zoomedObjectRef.current) {
                resetZoom()
              } else {
                zoomToWebView(cssObject)
              }
            } else if (zoomedObjectRef.current === cssObject) {
              cssObject.element.style.pointerEvents = "auto"
              // Allow iframe to handle the tap
            }
          } else {
            // Desktop click
            if (zoomedObjectRef.current === cssObject) {
              resetZoom()
            } else {
              zoomToWebView(cssObject)
            }
          }
        } else if (zoomedObjectRef.current && (!isTouch || isDoubleTap)) {
          resetZoom()
        }
      }

      if (!isTouch && !isMobileRef.current && !zoomedObjectRef.current && controlsRef.current) {
        controlsRef.current.lock()
      }
    },
    [resetZoom, zoomToWebView],
  )

  useEffect(() => {
    isMobileRef.current = /Android|iPhone|iPad/i.test(navigator.userAgent)

    setupScene()
    setupCamera()
    setupRenderers()
    setupControls()
    setupEnvironment()
    setupWebViews()
    setupLighting()

    // Start animation loop
    animate()

    // Event Listeners
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case "KeyW":
          moveRef.current.forward = 1
          break
        case "KeyS":
          moveRef.current.backward = 1
          break
        case "KeyA":
          moveRef.current.left = 1
          break
        case "KeyD":
          moveRef.current.right = 1
          break
        case "Escape":
          if (zoomedObjectRef.current) resetZoom()
          break
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case "KeyW":
          moveRef.current.forward = 0
          break
        case "KeyS":
          moveRef.current.backward = 0
          break
        case "KeyA":
          moveRef.current.left = 0
          break
        case "KeyD":
          moveRef.current.right = 0
          break
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (zoomedObjectRef.current || !cameraRef.current) return
      const pointer = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      )
      raycasterRef.current.setFromCamera(pointer, cameraRef.current)
      const intersects = raycasterRef.current.intersectObjects(webViewObjectsRef.current)
      webViewObjectsRef.current.forEach((obj, index) => {
        const originalConfig = webViewsConfigRef.current[index]
        if (originalConfig) {
          obj.scale.setScalar(originalConfig.originalScale)
          obj.element.style.boxShadow = originalConfig.iframe.style.boxShadow
        }
      })
      if (intersects.length > 0) {
        const intersectedObj = intersects[0].object as CSS3DObject
        const originalConfig = webViewsConfigRef.current.find((w) => w.iframe === intersectedObj.element)
        if (originalConfig) {
          intersectedObj.scale.setScalar(originalConfig.originalScale * 1.1)
          intersectedObj.element.style.boxShadow = "0 0 25px rgba(0,255,255,0.4)"
        }
      }
    }

    const handleResize = () => {
      if (cameraRef.current && rendererRef.current && cssRendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight
        cameraRef.current.updateProjectionMatrix()
        rendererRef.current.setSize(window.innerWidth, window.innerHeight)
        cssRendererRef.current.setSize(window.innerWidth, window.innerHeight)
      }
    }

    const handleOrientationChange = () => {
      setTimeout(handleResize, 100)
    }

    if (!isMobileRef.current) {
      document.addEventListener("click", (e) => handleInteraction(e, false))
      document.addEventListener("keydown", handleKeyDown)
      document.addEventListener("keyup", handleKeyUp)
      document.addEventListener("mousemove", handleMouseMove)
    } else {
      // Mobile joystick and touch setup
      const moveJoystickContainer = document.getElementById("move-joystick")
      const moveJoystick = moveJoystickContainer?.querySelector(".joystick")
      const lookJoystickContainer = document.getElementById("look-joystick")
      const lookJoystick = lookJoystickContainer?.querySelector(".joystick")

      const handleJoystick = (
        container: HTMLElement,
        joystick: HTMLElement,
        joystickState: typeof moveJoystickRef.current,
        touch: Touch,
      ) => {
        if (joystickState.touchId !== null && touch.identifier !== joystickState.touchId) return
        joystickState.touchId = touch.identifier

        const rect = container.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const touchX = touch.clientX
        const touchY = touch.clientY
        const dx = touchX - centerX
        const dy = touchY - centerY
        const distance = Math.sqrt(dx * dx + dy * dy)
        const maxDistance = rect.width / 2 - joystick.offsetWidth / 2
        let offsetX, offsetY

        if (distance > maxDistance) {
          const angle = Math.atan2(dy, dx)
          offsetX = Math.cos(angle) * maxDistance
          offsetY = Math.sin(angle) * maxDistance
        } else {
          offsetX = dx
          offsetY = dy
        }

        joystick.style.transform = `translate(${offsetX}px, ${offsetY}px)`
        joystick.classList.add("active")

        joystickState.active = true
        joystickState.vector.set(
          Math.max(-1, Math.min(1, offsetX / maxDistance)),
          Math.max(-1, Math.min(1, -offsetY / maxDistance)),
        )
      }

      const resetJoystick = (joystick: HTMLElement, joystickState: typeof moveJoystickRef.current) => {
        joystick.style.transform = "translate(0, 0)"
        joystick.classList.remove("active")
        joystickState.active = false
        joystickState.vector.set(0, 0)
        joystickState.touchId = null
      }

      const moveTouchStart = (e: TouchEvent) => {
        e.stopPropagation()
        const touch = e.changedTouches[0]
        if (moveJoystickContainer && moveJoystick)
          handleJoystick(moveJoystickContainer, moveJoystick, moveJoystickRef.current, touch)
      }
      const moveTouchMove = (e: TouchEvent) => {
        e.stopPropagation()
        for (const touch of e.changedTouches) {
          if (moveJoystickContainer && moveJoystick)
            handleJoystick(moveJoystickContainer, moveJoystick, moveJoystickRef.current, touch)
        }
      }
      const moveTouchEnd = (e: TouchEvent) => {
        e.stopPropagation()
        for (const touch of e.changedTouches) {
          if (touch.identifier === moveJoystickRef.current.touchId && moveJoystick) {
            resetJoystick(moveJoystick, moveJoystickRef.current)
          }
        }
      }

      const lookTouchStart = (e: TouchEvent) => {
        e.stopPropagation()
        const touch = e.changedTouches[0]
        if (lookJoystickContainer && lookJoystick)
          handleJoystick(lookJoystickContainer, lookJoystick, lookJoystickRef.current, touch)
      }
      const lookTouchMove = (e: TouchEvent) => {
        e.stopPropagation()
        for (const touch of e.changedTouches) {
          if (lookJoystickContainer && lookJoystick)
            handleJoystick(lookJoystickContainer, lookJoystick, lookJoystickRef.current, touch)
        }
      }
      const lookTouchEnd = (e: TouchEvent) => {
        e.stopPropagation()
        for (const touch of e.changedTouches) {
          if (touch.identifier === lookJoystickRef.current.touchId && lookJoystick) {
            resetJoystick(lookJoystick, lookJoystickRef.current)
          }
        }
      }

      moveJoystickContainer?.addEventListener("touchstart", moveTouchStart)
      moveJoystickContainer?.addEventListener("touchmove", moveTouchMove)
      moveJoystickContainer?.addEventListener("touchend", moveTouchEnd)

      lookJoystickContainer?.addEventListener("touchstart", lookTouchStart)
      lookJoystickContainer?.addEventListener("touchmove", lookTouchMove)
      lookJoystickContainer?.addEventListener("touchend", lookTouchEnd)

      document.addEventListener("touchstart", (e) => {
        if (e.target instanceof HTMLElement && e.target.closest(".joystick-container")) return
        handleInteraction(e, true)
      })

      document.addEventListener(
        "touchmove",
        (e) => {
          if (
            !(e.target instanceof HTMLElement && e.target.closest(".joystick-container")) &&
            !zoomedObjectRef.current
          ) {
            e.preventDefault()
          }
        },
        { passive: false },
      ) // Use passive: false for preventDefault

      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
        document.addEventListener(
          "touchstart",
          () => {
            DeviceOrientationEvent.requestPermission()
              .then((response) => {
                if (response === "granted") {
                  setupDeviceOrientation()
                }
              })
              .catch((error) => console.error("Device orientation permission failed:", error))
          },
          { once: true },
        )
      } else if (window.DeviceOrientationEvent) {
        setupDeviceOrientation()
      }
    }

    window.addEventListener("resize", handleResize)
    window.addEventListener("orientationchange", handleOrientationChange)

    // Cleanup function
    return () => {
      if (rendererRef.current) {
        mountRef.current?.removeChild(rendererRef.current.domElement)
        rendererRef.current.dispose()
      }
      if (cssRendererRef.current) {
        cssRendererMountRef.current?.removeChild(cssRendererRef.current.domElement)
      }
      if (controlsRef.current) {
        controlsRef.current.dispose()
      }

      if (!isMobileRef.current) {
        document.removeEventListener("click", (e) => handleInteraction(e, false))
        document.removeEventListener("keydown", handleKeyDown)
        document.removeEventListener("keyup", handleKeyUp)
        document.removeEventListener("mousemove", handleMouseMove)
      } else {
        const moveJoystickContainer = document.getElementById("move-joystick")
        const lookJoystickContainer = document.getElementById("look-joystick")

        moveJoystickContainer?.removeEventListener("touchstart", moveTouchStart)
        moveJoystickContainer?.removeEventListener("touchmove", moveTouchMove)
        moveJoystickContainer?.removeEventListener("touchend", moveTouchEnd)

        lookJoystickContainer?.removeEventListener("touchstart", lookTouchStart)
        lookJoystickContainer?.removeEventListener("touchmove", lookTouchMove)
        lookJoystickContainer?.removeEventListener("touchend", lookTouchEnd)

        document.removeEventListener("touchstart", (e) => {
          if (e.target instanceof HTMLElement && e.target.closest(".joystick-container")) return
          handleInteraction(e, true)
        })
        document.removeEventListener("touchmove", (e) => {
          if (
            !(e.target instanceof HTMLElement && e.target.closest(".joystick-container")) &&
            !zoomedObjectRef.current
          ) {
            e.preventDefault()
          }
        })
        window.removeEventListener("deviceorientation", setupDeviceOrientation)
      }

      window.removeEventListener("resize", handleResize)
      window.removeEventListener("orientationchange", handleOrientationChange)
    }
  }, [
    animate,
    setupScene,
    setupCamera,
    setupRenderers,
    setupControls,
    setupEnvironment,
    setupWebViews,
    setupLighting,
    handleInteraction,
    resetZoom,
    zoomToWebView,
    setupDeviceOrientation,
  ])

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0a1a] touch-none font-['Inter']">
      <div id="info" style={{ opacity: infoOpacity }}>
        Desktop: WASD: Move • Mouse: Look • Click: Zoom • Esc/Double-Click: Exit
        <br />
        Mobile: Joystick: Move • Look Joystick: Rotate • Double-Tap: Zoom • Tap: Interact • Double-Tap: Exit
      </div>
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={cssRendererMountRef} className="absolute inset-0 pointer-events-none" />

      {/* Mobile controls - display handled by globals.css media query */}
      <div id="mobile-controls">
        <div className="joystick-container" id="move-joystick">
          <div className="joystick" />
        </div>
      </div>
      <div id="look-controls">
        <div className="joystick-container" id="look-joystick">
          <div className="joystick" />
        </div>
      </div>
    </div>
  )
}
