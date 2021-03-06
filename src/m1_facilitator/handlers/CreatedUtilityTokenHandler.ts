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
// See the License for the specific

import ERC20GatewayTokenPair from '../models/ERC20GatewayTokenPair';
import Gateway from '../models/Gateway';
import GatewayRepository from '../repositories/GatewayRepository';
import ERC20GatewayTokenPairRepository from '../repositories/ERC20GatewayTokenPairRepository';
import Utils from '../../common/Utils';
import Logger from '../../common/Logger';

/**
 * It represents record of CreatedUtilityTokens entity.
 */
export interface CreatedUtilityTokenHandlerInterface {
  valueTokenAddress: string;
  utilityTokenAddress: string;
  contractAddress: string;
}

/**
 * It handles updates from CreatedUtilityTokenHandler entity.
 */
export default class CreatedUtilityTokenHandler {
  /** Instance of ERC20GatewayTokenPairRepository. */
  public erc20GatewayTokenPairRepository: ERC20GatewayTokenPairRepository;

  /** Instance of GatewayRepository. */
  public gatewayRepository: GatewayRepository;

  /**
   * Constructor of CreatedUtilityTokenHandler with params.
   *
   * @param erc20GatewayTokenPairRepository Instance of ERC20GatewayTokenPairRepository.
   * @param gatewayRepository Instance of GatewayRepository.
   */
  public constructor(
    erc20GatewayTokenPairRepository: ERC20GatewayTokenPairRepository,
    gatewayRepository: GatewayRepository,
  ) {
    this.erc20GatewayTokenPairRepository = erc20GatewayTokenPairRepository;
    this.gatewayRepository = gatewayRepository;
  }

  /**
   * Handles CreatedUtilityTokens entity records.
   * - It creates record in `ERC20TokenPair` model.
   * - This handler only reacts to UtilityTokenCreated event of ERC20Cogateway which are populated
   *   during seed data. It silently ignores the events by other ERC20Cogateway.
   *
   * @param records List of CreatedUtilityTokens entity.
   */
  public async handle(records: CreatedUtilityTokenHandlerInterface[]): Promise<void> {
    const savePromises = records.map(async (record): Promise<void> => {
      const gatewayRecord = await this.gatewayRepository.get(
        Gateway.getGlobalAddress(record.contractAddress),
      );
      if (gatewayRecord === null) {
        Logger.warn(
          'There is no gateway model in the gateway repository '
          + `matching to ${record.contractAddress}.`,
        );
        return;
      }
      Logger.debug(`Gateway record found for ${record.contractAddress}`);
      const erc20GatewayTokenPairRecord = await this.erc20GatewayTokenPairRepository.get(
        Utils.toChecksumAddress(record.contractAddress),
        Utils.toChecksumAddress(record.valueTokenAddress),
      );
      if (erc20GatewayTokenPairRecord === null) {
        const erc20GatewayTokenPair = await this.erc20GatewayTokenPairRepository.save(
          new ERC20GatewayTokenPair(
            Utils.toChecksumAddress(gatewayRecord.remoteGA),
            Utils.toChecksumAddress(record.valueTokenAddress),
            Utils.toChecksumAddress(record.utilityTokenAddress),
          ),
        );
        Logger.debug(`Creating ERC20GatewayTokenPair object: ${JSON.stringify(erc20GatewayTokenPair)}`);
      }
    });

    await Promise.all(savePromises);
    Logger.debug('Created ERC20GatewayTokenPair record');
  }
}
