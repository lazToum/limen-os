import { Vector3, Color3 } from "@babylonjs/core";

export interface Experience {
  id: string;
  name: string;
  description: string;
  position: Vector3;
  color: Color3;
}

export const experiences: Experience[] = [
  {
    id: "waldiez-player",
    name: "Classic Player",
    description: "Dive into the standard Waldiez player interface.",
    position: new Vector3(4, 0, 0),
    color: new Color3(0.1, 0.8, 0.1),
  },
  {
    id: "snake",
    name: "Snake",
    description: "Classic retro snake game.",
    position: new Vector3(-4, 0, 0),
    color: new Color3(0.8, 0.1, 0.1),
  },
  {
    id: "pool",
    name: "Pool",
    description: "Relaxing game of pool.",
    position: new Vector3(0, 4, 0),
    color: new Color3(0.1, 0.1, 0.8),
  },
  {
    id: "chess",
    name: "Chess",
    description: "Master the board.",
    position: new Vector3(0, -4, 0),
    color: new Color3(0.8, 0.8, 0.1),
  },
  {
    id: "bubble-shooter",
    name: "Bubbles",
    description: "Pop the bubbles!",
    position: new Vector3(3, 3, 3),
    color: new Color3(0.8, 0.1, 0.8),
  },
  {
    id: "pong",
    name: "Pong",
    description: "Classic arcade action.",
    position: new Vector3(-3, -3, -3),
    color: new Color3(0.1, 0.8, 0.8),
  },
];

export const hintMessages = [
  {
    title: "Welcome to Limen Lobby",
    text: "Use <strong>W, A, S, D</strong> to move. Click portals to launch apps.",
  },
  {
    title: "Immersive Discovery",
    text: "Move close to portals to see details and enter.",
  },
];
