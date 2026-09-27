import * as THREE from "three";
import { deviceQuaternion, screenRotation } from "./orientation";
import type { SensorSample } from "../contracts";
export class PhoneVisualizer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private phone = new THREE.Group();
  private content = new THREE.Group();
  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color("#edf0f3");
    this.camera.position.set(4, 3, 6);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 3));
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 2.7, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x172b45 }),
    );
    this.phone.add(body);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 2.35),
      new THREE.MeshBasicMaterial({ color: 0x1d96c9 }),
    );
    screen.position.z = 0.086;
    this.phone.add(screen);
    this.phone.add(this.content);
    const cameraDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    cameraDot.position.set(0, 1.25, 0.09);
    this.phone.add(cameraDot);
    this.phone.add(new THREE.AxesHelper(1.8));
    this.scene.add(this.phone);
    this.scene.add(new THREE.GridHelper(6, 8, 0x7890ad, 0xb8c8dc));
  }
  draw(s?: SensorSample) {
    const width = this.host.clientWidth,
      height = 300;
    if (
      this.renderer.domElement.width !==
      Math.round(width * this.renderer.getPixelRatio())
    ) {
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    if (s) {
      const q = deviceQuaternion(s.orientation);
      if (q) this.phone.quaternion.copy(q);
      this.content.rotation.z = screenRotation(s.screenAngle);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
