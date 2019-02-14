import { EVENT, TOPIC, CONNECTION_ACTIONS, ParseResult, Message } from '../../constants'
import * as messageBuilder from '../../../text-protocol/src/message-builder'
import * as messageParser from '../../../text-protocol/src/message-parser'
import * as uws from 'uws'
import { EventEmitter } from 'events'

/**
 * This class wraps around a websocket
 * and provides higher level methods that are integrated
 * with deepstream's message structure
 *
 * @param {WebSocket} external        uws native websocket
 * @param {Object} handshakeData      headers from the websocket http handshake
 * @param {Logger} logger
 * @param {Object} config             configuration options
 * @param {Object} connectionEndpoint the uws connection endpoint
 *
 * @extends EventEmitter
 *
 * @constructor
 */
export class UwsSocketWrapper extends EventEmitter implements SocketWrapper {

  public isClosed: boolean = false
  public user: string
  public uuid: number = Math.random()
  public authCallback: Function
  public authAttempts: number = 0

  private bufferedWrites: string = ''

  public authData: object
  public clientData: object
  public isRemote: boolean

  constructor (
    private external: any,
    private handshakeData: any,
    private logger: Logger,
    private config: any,
    private connectionEndpoint: ConnectionEndpoint
   ) {
    super()
    this.setMaxListeners(0)
  }

  get isOpen() {
    return this.isClosed !== true
  }

  /**
   * Variant of send with no particular checks or appends of message.
   */
  public sendNativeMessage (message: string | Buffer, allowBuffering: boolean): void {
    if (this.isOpen) {
      uws.native.server.send(this.external, message, uws.OPCODE_TEXT)
    }
    /*
     *if (this.config.outgoingBufferTimeout === 0) {
     *  uws.native.server.send(this.external, message, uws.OPCODE_TEXT)
     *} else if (!allowBuffering) {
     *  this.flush()
     *  uws.native.server.send(this.external, message, uws.OPCODE_TEXT)
     *} else {
     *  this.bufferedWrites += message
     *  if (this.connectionEndpoint.scheduleFlush) {
     *    this.connectionEndpoint.scheduleFlush(this)
     *  }
     *}
     */
  }

  /**
   * Called by the connection endpoint to flush all buffered writes.
   * A buffered write is a write that is not a high priority, such as an ack
   * and can wait to be bundled into another message if necessary
   */
  public flush () {
    if (this.bufferedWrites !== '' && this.isOpen) {
      uws.native.server.send(this.external, this.bufferedWrites)
      this.bufferedWrites = ''
    }
  }

  /**
   * Sends a message based on the provided action and topic
   * @param {Boolean} allowBuffering Boolean to indicate that buffering is allowed on
   *                                 this message type
   */
  public sendMessage (message: { topic: TOPIC, action: CONNECTION_ACTIONS } | Message, allowBuffering: boolean): void {
    if (this.isOpen) {
      this.sendNativeMessage(
        messageBuilder.getMessage(message, false),
        allowBuffering
      )
    }
  }

  public getMessage (message: Message): Buffer | string {
    return messageBuilder.getMessage(message, false)
  }

  public parseMessage (message: string | ArrayBuffer): Array<ParseResult> {
    let messageBuffer: string | Buffer
    if (message instanceof ArrayBuffer) {
      /* we copy the underlying buffer (since a shallow reference won't be safe
       * outside of the callback)
       * the copy could be avoided if we make sure not to store references to the
       * raw buffer within the message
       */
      messageBuffer = Buffer.from(Buffer.from(message))
    } else {
      return messageParser.parse(message)
    }
    return messageParser.parse(messageBuffer)
  }

  /**
   * Sends a message based on the provided action and topic
   * @param {Boolean} allowBuffering Boolean to indicate that buffering is allowed on
   *                                 this message type
   */
  public sendAckMessage (message: Message, allowBuffering: boolean): void {
    if (this.isOpen) {
      this.sendNativeMessage(
        messageBuilder.getMessage(message, true),
        allowBuffering
      )
    }
  }

  public parseData (message: Message): true | Error {
    return messageParser.parseData(message)
  }

  public onMessage (messages: Array<Message>): void {
  }

  /**
   * Destroys the socket. Removes all deepstream specific
   * logic and closes the connection
   */
  public destroy (): void {
    // Not sure if this should only happen on closed sockets or not
    uws.native.server.terminate(this.external)
  }

  public close (): void {
    this.isClosed = true
    delete this.authCallback
    this.emit('close', this)
    this.logger.info(EVENT.CLIENT_DISCONNECTED, this.user)
    this.removeAllListeners()
  }

  /**
   * Returns a map of parameters that were collected
   * during the initial http request that established the
   * connection
   */
  public getHandshakeData (): any {
    return this.handshakeData
  }
}

export function createSocketWrapper (
  external: any,
  handshakeData: any,
  logger: Logger,
  config: InternalDeepstreamConfig,
  connectionEndpoint: ConnectionEndpoint
) { return new UwsSocketWrapper(external, handshakeData, logger, config, connectionEndpoint) }
