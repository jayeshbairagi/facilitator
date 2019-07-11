import BigNumber from 'bignumber.js';
import { GatewayRepository } from '../repositories/GatewayRepository';
import { MessageRepository } from '../repositories/MessageRepository';
import Logger from '../Logger';
import Utils from '../Utils';
import { AUXILIARY_GAS_PRICE } from '../Constants';
import Observer from '../observer/Observer';
import { AuxiliaryChain } from '../repositories/AuxiliaryChainRepository';

const Mosaic = require('@openst/mosaic.js');

export default class ProveGatewayService extends Observer<AuxiliaryChain> {
  private gatewayRepository: GatewayRepository;

  private messageRepository: MessageRepository;

  private originWeb3: object;

  private auxiliaryWeb3: object;

  private auxiliaryWorkerAddress: string;

  private gatewayAddress: string;

  private auxiliaryChainId: number;

  /**
   *  Constructor
   *
   * @param gatewayRepository Instance of auxiliary chain repository.
   * @param messageRepository Instance of message repository.
   * @param originWeb3 Origin Web3 instance.
   * @param auxiliaryWeb3 Auxiliary Web3 instance.
   * @param auxiliaryWorkerAddress auxiliary worker address, this should be
   *                               unlocked and added in web3 wallet.
   * @param gatewayAddress Address of gateway contract on origin chain.
   * @param auxiliaryChainId Auxiliary chain Id.
   */
  public constructor(
    gatewayRepository: GatewayRepository,
    messageRepository: MessageRepository,
    originWeb3: object,
    auxiliaryWeb3: object,
    auxiliaryWorkerAddress: string,
    gatewayAddress: string,
    auxiliaryChainId: number,
  ) {
    super();

    this.gatewayRepository = gatewayRepository;
    this.originWeb3 = originWeb3;
    this.auxiliaryWeb3 = auxiliaryWeb3;
    this.auxiliaryWorkerAddress = auxiliaryWorkerAddress;
    this.gatewayAddress = gatewayAddress;
    this.messageRepository = messageRepository;
    this.auxiliaryChainId = auxiliaryChainId;

    // Suppressing lint error
    // Refer: https://github.com/typescript-eslint/typescript-eslint/issues/636
    /* eslint-disable @typescript-eslint/unbound-method */
    this.proveGateway = this.proveGateway.bind(this);
    this.update = this.update.bind(this);
  }


  /**
   * This method react on changes in auxiliary chain models.
   * @param auxiliaryChains List of auxiliary chains model
   */
  public async update(auxiliaryChains: AuxiliaryChain[]): Promise<void> {
    const proveGatewayPromises = auxiliaryChains
      .filter((auxiliaryChain): boolean => auxiliaryChain.chainId === this.auxiliaryChainId
      && auxiliaryChain.lastOriginBlockHeight !== undefined)
      .map(
        async (auxiliaryChain): Promise<{
          transactionHash: string;
          message: string;
        }> => this.proveGateway(auxiliaryChain.lastOriginBlockHeight!),
      );

    await Promise.all(proveGatewayPromises);
  }

  /**
   * This method performs prove gateway transaction on auxiliary chain.
   * This throws if auxiliary chain details doesn't exist.
   *
   * @param blockHeight Block height at which anchor state root happens.
   *
   * @return Return a promise that resolves to object which tell about success or failure.
   */
  public async proveGateway(
    blockHeight: BigNumber,
  ): Promise<{ transactionHash: string; message: string}> {
    const gatewayRecord = await this.gatewayRepository.get(this.gatewayAddress);
    if (gatewayRecord === null) {
      Logger.error(`Gateway record record doesnot exists for gateway ${this.gatewayAddress}`);
      return Promise.reject(new Error('Gateway record record doesnot exists for given gateway'));
    }

    const pendingMessages = await this.messageRepository.hasPendingOriginMessages(
      blockHeight,
      this.gatewayAddress,
    );
    if (!pendingMessages) {
      Logger.info(
        `There are no pending messages for gateway ${this.gatewayAddress}.`
        + ' Hence skipping proveGateway',
      );
      return Promise.resolve(
        {
          transactionHash: '',
          message: 'There are no pending messages for this gateway.',
        },
      );
    }
    const { gatewayAddress } = this;
    const coGateway = gatewayRecord.remoteGatewayAddress;
    const { ProofGenerator } = Mosaic.Utils;

    Logger.info(`Generating proof for gateway address ${this.gatewayAddress} at blockHeight ${blockHeight.toString()}`);
    const proofGenerator = new ProofGenerator(this.originWeb3, this.auxiliaryWeb3);
    const {
      encodedAccountValue,
      serializedAccountProof,
    } = await proofGenerator.getOutboxProof(
      gatewayAddress,
      [],
      blockHeight,
    );
    Logger.info(`Proof generated encodedAccountValue ${encodedAccountValue} and serializedAccountProof ${serializedAccountProof} `);
    const transactionHash = await this.prove(
      coGateway,
      blockHeight,
      encodedAccountValue,
      serializedAccountProof,
    );

    Logger.info(`Prove gateway transaction hash ${transactionHash}`);
    return { transactionHash, message: 'Gateway successfully proven' };
  }

  /**
   * This is a private method which uses mosaic.js to make proveGateway transaction.
   *
   * @param ostCoGatewayAddress  ost co-gateway address.
   * @param lastOriginBlockHeight Block height at which latest state root is anchored.
   * @param encodedAccountValue RPL encoded value of gateway account.
   * @param serializedAccountProof RLP encoded value of account proof.
   *
   * @return Return a promise that resolves to receipt.
   */
  private async prove(
    ostCoGatewayAddress: string,
    lastOriginBlockHeight: BigNumber,
    encodedAccountValue: string,
    serializedAccountProof: string,
  ): Promise<string> {
    const { EIP20CoGateway } = Mosaic.ContractInteract;

    const eip20CoGateway = new EIP20CoGateway(this.auxiliaryWeb3, ostCoGatewayAddress);

    const transactionOptions = {
      from: this.auxiliaryWorkerAddress,
      gasPrice: AUXILIARY_GAS_PRICE,
    };
    const rawTx = await eip20CoGateway.proveGatewayRawTx(
      lastOriginBlockHeight,
      encodedAccountValue,
      serializedAccountProof,
    );
    return Utils.sendTransaction(
      rawTx,
      transactionOptions,
    );
  }
}
