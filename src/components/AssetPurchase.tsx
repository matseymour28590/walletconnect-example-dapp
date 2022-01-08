import * as React from "react";
import { IWalletTransaction } from "../helpers/types";
import algosdk, { Transaction } from "algosdk";
import { formatJsonRpcRequest } from "@json-rpc-tools/utils";
import WalletConnect from "@walletconnect/client";
import { apiGetTxnParams, ChainType } from "../helpers/api";

interface IParams {
  clawback: string;
  decimals: number;
  "default-frozen": boolean;
  freeze: string;
  manager: string;
  name: string;
  "name-b64": string;
  reserve: string;
  total: number;
  "unit-name": string;
  "unit-name-b64": string;
  url: string;
  "url-b64": string;
}

interface IToken {
  "created-at-round": number;
  deleted: boolean;
  index: number;
  params: IParams;
}

interface ISale {
  sale_token: IToken;
  sale_start: number;
  sale_end: number;
  accept_token: IToken;
  accept_units: number;
  our_address: string;
  chain: ChainType;
}

interface IState {
  sale: ISale | null;
  error: string;
  numAcceptTokens: number;
  numSaleTokens: number;
  pendingRequest: boolean;
}

interface IProps extends React.Props<any> {
  connector: WalletConnect | null;
  customer_address: string;
}

const INITIAL_STATE: IState = {
  sale: null,
  error: "",
  numAcceptTokens: 0,
  numSaleTokens: 0,
  pendingRequest: false,
};

// Sale states
const PENDING = "pending";
const ONGOING = "ongoing";

class AssetPurchase extends React.Component<IProps, IState> {
  private static encodeTxn(txn: Transaction) {
    return Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString("base64");
  }

  public state: IState = {
    ...INITIAL_STATE,
  };
  public constructor(props: IProps) {
    super(props);
  }

  public componentDidMount = () => {
    this.getSalesParams();
  };

  public render = () => {
    const saleState: string = this.getSaleState();
    if (saleState === PENDING) {
      return <div>Get ready to buy seeds</div>;
    } else if (saleState === ONGOING) {
      return (
        <div>
          <h4>Buy Seeds!</h4>
          <div>
            <label>Number to buy:</label>
            <input
              value={this.state.numAcceptTokens}
              onChange={event => this.updateNumAcceptTokens(parseFloat(event.target.value))}
              type={"number"}
            />
            <button onClick={this.submit}>GO</button>
          </div>
        </div>
      );
    } else {
      return <div>It ended</div>;
    }
  };

  public submit = async () => {
    if (!this.props.connector || !this.state.sale) {
      return;
    }

    // const optinTxn = await this.assetTransferTxn(
    //   this.props.customer_address,
    //   this.props.customer_address,
    //   this.state.sale.sale_token.index,
    //   0,
    // );

    const customerTxn = await this.assetTransferTxn(
      this.props.customer_address,
      this.state.sale.our_address,
      this.state.sale.accept_token.index,
      this.state.numAcceptTokens,
      2000,
    );

    const ourTxn = await this.assetTransferTxn(
      this.state.sale.our_address,
      this.props.customer_address,
      this.state.sale.sale_token.index,
      this.state.numSaleTokens,
      0,
    );

    const txnsToSign = [customerTxn, ourTxn];
    algosdk.assignGroupID(txnsToSign);

    const walletTxns: IWalletTransaction[] = [
      // {
      //   txn: AssetPurchase.encodeTxn(optinTxn),
      //   signers: undefined,
      //   authAddr: undefined,
      //   message: `Opt-in to asset ${this.state.sale.sale_token.params.name}`,
      // },
      {
        txn: AssetPurchase.encodeTxn(customerTxn),
        signers: undefined,
        authAddr: undefined,
        message: `Send ${this.state.numAcceptTokens} ${this.state.sale.accept_token.params.name}`,
      },
      {
        txn: AssetPurchase.encodeTxn(ourTxn),
        signers: [],
        message: `Receive ${this.state.numSaleTokens} ${this.state.sale.sale_token.params.name}`,
      },
    ];

    // sign transaction
    const request = formatJsonRpcRequest("algo_signTxn", [walletTxns]);
    const signedTxns = await this.props.connector.sendCustomRequest(request);
    console.log(signedTxns);
    this._callSigningAPI(signedTxns[0], ourTxn);
  };

  private _callSigningAPI = (signedTxn: number[], unsignedTxn: Transaction) => {
    fetch("http://localhost:8000/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signedTransaction: signedTxn,
        unsignedTransaction: unsignedTxn,
      }),
    })
      .then(data => {
        console.log("Success:", data);
      })
      .catch(error => {
        console.error("Error:", error);
      });
  };

  private getSaleState = () => {
    return ONGOING;
    // const now: number = Date.now() / 1000;
    // if (this.state.sale && this.state.sale.sale_start < now) {
    //   return PENDING;
    // } else {
    //   return ONGOING;
    // }
  };

  private updateNumAcceptTokens = (numAcceptTokens: number) => {
    if (!this.state.sale) {
      return;
    }

    this.setState({
      numAcceptTokens,
      numSaleTokens: numAcceptTokens / this.state.sale.accept_units,
    });
  };

  private getSalesParams = () => {
    fetch("https://tokensales-staging.s3.eu-west-2.amazonaws.com/SproutCoin-52674863.json", {
      method: "GET",
    }).then(response => {
      if (response.ok) {
        const json = response.json();
        json.then(json => {
          if (response.ok) {
            this.setState({ sale: json });
          }
        });
      } else {
        console.log("Alerting!!!");
        window.alert("Something went wrong."); // TODO: Do something better
      }
    });
  };

  // TODO: Charge all the fee to the customer
  private assetTransferTxn = async (
    address_from: string,
    address_to: string,
    assetIndex: number,
    amount: number,
    fee: number,
  ) => {
    // @ts-ignore
    const params = await apiGetTxnParams(this.state.sale.chain);
    params.fee = fee;
    params.flatFee = true;
    console.log(amount);
    return algosdk.makeAssetTransferTxnWithSuggestedParams(
      address_from,
      address_to,
      undefined,
      undefined,
      amount,
      undefined,
      assetIndex,
      params,
    );
  };
}

export { AssetPurchase };
