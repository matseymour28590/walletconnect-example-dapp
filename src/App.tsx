import * as React from "react";
import styled from "styled-components";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "algorand-walletconnect-qrcode-modal";
import { IInternalEvent } from "@walletconnect/types";
import Button from "./components/Button";
import Column from "./components/Column";
import Wrapper from "./components/Wrapper";
import Header from "./components/Header";
import Loader from "./components/Loader";
import { fonts } from "./styles";
import { apiGetAccountAssets, ChainType } from "./helpers/api";
import { IAssetData } from "./helpers/types";
import AccountAssets from "./components/AccountAssets";
import { AssetPurchase } from "./components/AssetPurchase";

const SLayout = styled.div`
  position: relative;
  width: 100%;
  /* height: 100%; */
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper as any)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const SLanding = styled(Column as any)`
  height: 600px;
`;

const SButtonContainer = styled(Column as any)`
  width: 250px;
  margin: 50px 0;
`;

const SConnectButton = styled(Button as any)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  margin: 12px 0;
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

// @ts-ignore
const SBalances = styled(SLanding as any)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

interface IResult {
  method: string;
  body: Array<
    Array<{
      txID: string;
      signingAddress?: string;
      signature: string;
    } | null>
  >;
}

interface IAppState {
  connector: WalletConnect | null;
  customer_address: string;
  fetching: boolean;
  connected: boolean;
  showModal: boolean;
  pendingRequest: boolean;
  signedTxns: Uint8Array[][] | null;
  pendingSubmissions: Array<number | Error>;
  uri: string;
  accounts: string[];
  result: IResult | null;
  chain: ChainType;
  assets: IAssetData[];
}

const INITIAL_STATE: IAppState = {
  connector: null,
  customer_address: "",
  fetching: false,
  connected: false,
  showModal: false,
  pendingRequest: false,
  signedTxns: null,
  pendingSubmissions: [],
  uri: "",
  accounts: [],
  result: null,
  chain: ChainType.TestNet,
  assets: [],
};

class App extends React.Component<unknown, IAppState> {
  public state: IAppState = {
    ...INITIAL_STATE,
  };

  public walletConnectInit = async () => {
    // bridge url
    const bridge = "https://bridge.walletconnect.org";

    // create new connector
    const connector = new WalletConnect({ bridge, qrcodeModal: QRCodeModal });

    await this.setState({ connector });

    // check if already connected
    if (!connector.connected) {
      // create new session
      await connector.createSession();
    }

    // subscribe to events
    await this.subscribeToEvents();
  };
  public subscribeToEvents = () => {
    const { connector } = this.state;

    if (!connector) {
      return;
    }

    connector.on("session_update", async (error, payload) => {
      console.log(`connector.on("session_update")`);

      if (error) {
        throw error;
      }

      const { accounts } = payload.params[0];
      this.onSessionUpdate(accounts);
    });

    connector.on("connect", (error, payload) => {
      console.log(`connector.on("connect")`);

      if (error) {
        throw error;
      }

      this.onConnect(payload);
    });

    connector.on("disconnect", (error, payload) => {
      console.log(`connector.on("disconnect")`);

      if (error) {
        throw error;
      }

      this.onDisconnect();
    });

    if (connector.connected) {
      const { accounts } = connector;
      const address = accounts[0];
      this.setState({
        connected: true,
        customer_address: address,
        accounts,
      });
      this.onSessionUpdate(accounts);
    }

    this.setState({ connector });
  };

  public killSession = async () => {
    const { connector } = this.state;
    if (connector) {
      connector.killSession();
    }
    this.resetApp();
  };

  public chainUpdate = (newChain: ChainType) => {
    this.setState({ chain: newChain }, this.getAccountAssets);
  };

  public resetApp = async () => {
    await this.setState({ ...INITIAL_STATE });
  };

  public onConnect = async (payload: IInternalEvent) => {
    const { accounts } = payload.params[0];
    const address = accounts[0];
    await this.setState({
      connected: true,
      accounts,
      customer_address: address,
    });
    this.getAccountAssets();
  };

  public onDisconnect = async () => {
    this.resetApp();
  };

  public onSessionUpdate = async (accounts: string[]) => {
    const address = accounts[0];
    await this.setState({ accounts, customer_address: address });
    await this.getAccountAssets();
  };

  public getAccountAssets = async () => {
    this.setState({ fetching: true });
    try {
      // get account balances
      const assets = await apiGetAccountAssets(this.state.chain, this.state.customer_address);

      await this.setState({ fetching: false, customer_address: this.state.customer_address, assets });
    } catch (error) {
      console.error(error);
      await this.setState({ fetching: false });
    }
  };

  public toggleModal = () =>
    this.setState({
      showModal: !this.state.showModal,
      pendingSubmissions: [],
    });

  public render = () => {
    const chain = this.state.chain;
    const assets = this.state.assets;
    const customer_address = this.state.customer_address;
    const connected = this.state.connected;
    const fetching = this.state.fetching;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={customer_address}
            killSession={this.killSession}
            chain={chain}
            chainUpdate={this.chainUpdate}
          />
          <h3>{`Invest in Sprout`}</h3>
          <SContent>
            {!customer_address && !assets.length ? (
              <SLanding center>
                <SButtonContainer>
                  <SConnectButton left onClick={this.walletConnectInit} fetching={fetching}>
                    {"Connect to WalletConnect"}
                  </SConnectButton>
                </SButtonContainer>
              </SLanding>
            ) : (
              <div>
                <AssetPurchase
                  customer_address={customer_address}
                  connector={this.state.connector}
                />
                <SBalances>
                  <h4>My Balances</h4>
                  {!fetching ? (
                    <AccountAssets assets={assets} />
                  ) : (
                    <Column center>
                      <SContainer>
                        <Loader />
                      </SContainer>
                    </Column>
                  )}
                </SBalances>
              </div>
            )}
          </SContent>
        </Column>
      </SLayout>
    );
  };
}

export default App;
