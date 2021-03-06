// Copyright 2020 OpenST Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import MessageRepository from '../repositories/MessageRepository';
import Message, { MessageStatus, MessageType } from '../models/Message';
import GatewayRepository from '../repositories/GatewayRepository';

import assert = require('assert');

/**
 * This class handles the updates from ConfirmDepositIntents entity.
 */
export default class ConfirmDepositIntentsHandler {
  /* Instance of message repository. */
  private messageRepository: MessageRepository;

  /* Instance of gateway repository. */
  private gatewayRepository: GatewayRepository;

  /**
   * Construct ConfirmDepositIntentHandler with params.
   *
   * @param messageRepository Instance of message repository.
   * @param gatewayRepository Instance of gateway repository.
   */
  public constructor(
    messageRepository: MessageRepository,
    gatewayRepository: GatewayRepository,
  ) {
    this.gatewayRepository = gatewayRepository;
    this.messageRepository = messageRepository;
  }

  /**
   * Handles the ConfirmDepositIntent entity.
   * - It updates target status of message to `Declared` if it is undeclared.
   * - If message does not exists it create a message record.
   * - This handler only reacts to the events of gateways which are populated
   *   during seed data. It silently ignores the events by other gateways.
   *
   * @param records List of ConfirmDepositIntents.
   */
  public async handle(records: {
    messageHash: string;
    contractAddress: string;
  }[]): Promise<void> {
    const savePromises = records.map(async (record): Promise<void> => {
      let message = await this.messageRepository.get(record.messageHash);

      if (message === null) {
        const gatewayRecord = await this.gatewayRepository.get(record.contractAddress);
        if (gatewayRecord !== null) {
          message = new Message(
            record.messageHash,
            MessageType.Deposit,
            MessageStatus.Undeclared,
            MessageStatus.Undeclared,
            gatewayRecord.remoteGA,
          );
        }
      }
      if (message !== null) {
        if (message.targetStatus === MessageStatus.Undeclared) {
          assert(message.type === MessageType.Deposit);

          message.targetStatus = MessageStatus.Declared;
          await this.messageRepository.save(message);
        }
      }
    });

    await Promise.all(savePromises);
  }
}
