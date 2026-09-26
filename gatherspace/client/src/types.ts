// client/src/types.ts
// Single source of truth for the client wire protocol.

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  hairColor: string;
  x: number;
  y: number;
  dir: Direction;
  isMoving: boolean;
  zoneId: string | null;
}

export type ClientMessage =
  | {
      type: 'JOIN';
      payload: {
        roomId: string;
        name: string;
        color: string;
        hairColor: string;
      };
    }
  | {
      type: 'MOVE';
      payload: {
        x: number;
        y: number;
        dir: Direction;
        isMoving: boolean;
        zoneId: string | null;
      };
    }
  | {
      type: 'CHAT';
      payload: {
        scope: 'spatial' | 'global';
        text: string;
      };
    };

export type ServerMessage =
  | {
      type: 'INIT_STATE';
      payload: {
        selfId: string;
        liveKitToken: string;
        liveKitUrl: string;
        players: Record<string, PlayerState>;
      };
    }
  | {
      type: 'PLAYER_JOINED';
      payload: PlayerState;
    }
  | {
      type: 'PLAYER_MOVED';
      payload: {
        id: string;
        x: number;
        y: number;
        dir: Direction;
        isMoving: boolean;
        zoneId: string | null;
      };
    }
  | {
      type: 'PLAYER_LEFT';
      payload: { id: string };
    }
  | {
      type: 'CHAT_BROADCAST';
      payload: {
        senderId: string;
        senderName: string;
        scope: 'spatial' | 'global';
        text: string;
        timestamp: number;
      };
    };
