export interface MessageNotificationProvider {
  notifyMessage(message: string): Promise<void>;
}
