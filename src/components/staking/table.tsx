import React, { useEffect, useState } from "react";
import useWalletNfts from "../../hooks/use-wallet-nfts";
import { Button, FilledButton } from "../button";
import { IMint, IMission, MissionEntry } from "./missions";
import cn from "classnames";
import { useMutation, useSubscription, useQuery } from "@apollo/react-hooks";
import gql from "graphql-tag";
import { useWallet } from "@solana/wallet-adapter-react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { MISSION_KEY } from "../../utils/constants";
import { useDigsite } from "../../hooks/use-current-digsite";
import classNames from "classnames";
import { useStyxBalance } from "../../hooks/use-wallet-balance";

const digSiteToType = {
  staking: "staking"
};

let statusflag = 0;
let mint = '';

export const StakingTable = (props: {
  missions: IMission[];
  usersActiveMints: string[];
}) => {
  const { missions, usersActiveMints } = props;
  const { currentDigsite } = useDigsite();
  const [loadingFlag, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const wallet = useWallet();
  const [isLoading, nfts, getNFTs, sendNFT, status]: any = useWalletNfts();
  const [isShowingWalletNFTS, setIsShowingWalletNFTS] =
    useState<boolean>(false);
  const { styxBalance, sendStyx, getStyxBalance } = useStyxBalance();
  const [selectedNfts, setSelectedNfts] = useState<IMint[]>([]);
  const [selectedType, setSelectedType] = useState<string>("staking");

  const { data: statusData, loading } = useQuery(
    gql`
      query getItem($where: items_bool_exp) {
        items(where: $where) {
          mint
          status
        }
      }
    `,
    {
      variables: {
        where: {
          _and: {
            current_owner: {
              _eq: wallet?.publicKey?.toBase58(),
            },
            status: {
              _gt: 0
            }
          }
        },
      },
    }
  );

  // const {
  //   data: statsData,
  //   loading: statsLoading,
  //   refetch: refetchStats,
  // } = useQuery(
  //   gql`
  //     query getItem() {
  //       items() {
  //         status
  //         mint
  //       }
  //     }
  //   `  );

  // console.log("status result", statusData, loading, statusData?.items?.length)

  if(statusData?.items?.length > 0) {
    // console.log("status >>> ", parseInt(statusData?.items[0]?.status), statusData?.items[0]?.mint);
    statusflag = parseInt(statusData?.items[0]?.status);
    mint = statusData?.items[0]?.mint;
  }

  const [insertMission] = useMutation(gql`
    mutation insertMission($object: missions_insert_input!) {
      insert_missions_one(object: $object) {
        id
      }
    }
  `);

  useEffect(() => {
    getNFTs();
  }, [missions, usersActiveMints]);

  const omens = isLoading
    ? new Array(10).fill(0)
    : nfts.filter(
        (nft: any) =>
          nft.symbol === "OMEN" && usersActiveMints.indexOf(nft.mint) === -1
      );
  
  const stakingMissions = missions.filter((m) => m.type === "staking");
  // const normalMissions = missions.filter((m) => m.type === "normal");
  // const locked3Missions = missions.filter((m) => m.type === "locked3");
  // const locked7Missions = missions.filter((m) => m.type === "locked7");
  // const locked15missions = missions.filter((m) => m.type === "locked15");

  const missionTypes = [
    {
      list: stakingMissions,
      type: "staking",
    },
  ];

  const sendOff = () => {
    setLoading(true);
    if (styxBalance > MISSION_KEY[selectedType].cost) {
      sendNFT(selectedNfts.map((nft) => nft.mint), statusflag, mint)
        .then((data: any) => {
          if (data.error) {
            getNFTs();
            setLoading(false);
            setError(data.error.message);
          } else {
            if (MISSION_KEY[selectedType].cost > 0) {
              sendStyx(MISSION_KEY[selectedType].cost)
                .then(() => {
                  addMission(data);
                })
                .catch(() => {
                  addMission(data);
                });
            } else {
              addMission(data);
            }
          }
        })
        .catch(() => {
          setLoading(false);
          setError("Unknown error occurred");
        });
    }
  };

  const addMission = (data: any) => {
    Promise.all(
      selectedNfts.map((nft) =>
        insertMission({
          variables: {
            object: {
              reward: MISSION_KEY[selectedType].reward,
              type: selectedType,
              wallet: wallet.publicKey.toString(),
              started_at: "now()",
              extract_at: dayjs()
                .add(MISSION_KEY[selectedType].earningCycle, "h")
                .toISOString(),
              transactions: [
                {
                  tx: data.message,
                  tx_info: "Staking Started",
                },
              ],
              mints: [nft],
              status: "pending",
            },
          },
        })
      )
    ).then(() => {
      // refetchMissions();
      getNFTs();
      setSelectedType("staking");
      setSelectedNfts([]);
      setLoading(false);
    });
  };

  return (
    <div
      className={classNames(
        "flex flex-col",
        `text-${currentDigsite}OffsetAccent`
      )}
    >
      {loadingFlag && (
        <div className="fixed w-full h-full overflow-hidden bg-secondary bg-opacity-80 top-0 left-0 right-0 bottom-0 z-50 flex flex-col items-center justify-center">
          <p className="font-bebas tracking-spaced text-5xl underline    ">
            DO NOT CLOSE OR REFRESH THIS PAGE
          </p>
          <p className="font-viet uppercase tracking-spaced  ">
            Please follow the wallet prompts, please note even after signing the
            transaction it may take upwards of 30 seconds to send and confirm
            the transaction!
          </p>
          {status && (
            <p className="font-viet uppercase tracking-spaced text-lg mt-10  ">
              {status}
            </p>
          )}
        </div>
      )}
      {missionTypes?.filter((type) => type.type === currentDigsite)?.[0]?.list
        ?.length > 0 ? (
        <div className={"flex flex-col"}>
          {missionTypes
            ?.filter((type) => type.type === currentDigsite)?.[0]
            ?.list?.map((mission: IMission, idx) => {
              return <MissionEntry mission={mission} key={idx}/>;
            })}
        </div>
      ) : (
        <p className="text-3xl font-bebas tracking-spaced text-center my-4">
          Not currently digging!
        </p>
      )}
      <div
        className={
          "flex lg:flex-row flex-col items-center justify-between mb-4"
        }
      >
        <p className="  font-viet uppercase tracking-spaced text-sm">
          NOTE: Click the status labeled with '*' to get the latest transaction
          on that dig!
        </p>
        <div
          className={cn(
            isShowingWalletNFTS ? "lg:w-1/3 w-full" : "lg:w-1/4 w-full",
            "flex w-1/3 lg:mt-0 mt-2 justify-between"
          )}
        >
          <Button
            onClick={() => {
              if (
                selectedType &&
                selectedNfts.length > 0 &&
                selectedNfts.length <= 5
              ) {
                sendOff();
              } else {
                if (!selectedType) {
                  toast.error("Please select a dig type!");
                }
              }
            }}
            text={"Dig"}
          />
        </div>
      </div>
      <div className="w-full">
        <MissionEntry
          mission={{
            id: "example",
            // @ts-ignore
            reward: MISSION_KEY[selectedType].reward,
            started_at: dayjs().toString(),
            extract_at: dayjs()
              .add(MISSION_KEY[selectedType].earningCycle, "h")
              .toString(),
            type: selectedType,
            mints: selectedNfts,
            is_example: true,
          }}
        />
      </div>
      <div className="flex flex-col mt-2 mb-4">
        <div
          className={`w-full mb-4 bg-black bg-opacity-50 py-8 px-5 rounded-lg border-${currentDigsite}OffsetAccent border-special-sm`}
        >
          <p
            className={"text-4xl font-bebas tracking-spaced w-full text-center"}
          >
            Select Omens
          </p>
          <div className="flex flex-wrap p-2 max-h-72 overflow-auto">
            {omens.length > 0 ? (
              omens.map((nft: any, keyIndex) => {
                const isSelected =
                  selectedNfts.filter((_n: any) => nft.mint === _n.mint)
                    .length > 0;
                return isLoading ? (
                  <a className={cn("flex flex-col m-2", "opacity-40")} key= {keyIndex}>
                    <img
                      className={`w-24 h-24 border-${currentDigsite}OffsetAccent rounded-md border-special-sm`}
                      src={"/loader.png"}
                    />
                    <p className={"font-viet uppercase tracking-spaced"}>
                      Omen
                    </p>
                  </a>
                ) : (
                  <a
                    onClick={() => {
                      if (!isSelected) {
                        if (selectedNfts.length + 1 > 5) {
                          return toast.error("Max Omens per transaction met");
                        }
                        setSelectedNfts([...selectedNfts, nft]);
                      } else {
                        setSelectedNfts(
                          selectedNfts.filter((n) => n.mint !== nft.mint)
                        );
                      }
                    }}
                    className={cn(
                      "flex flex-col m-2 items-center justify-center",
                      isSelected && "opacity-40"
                    )}
                    key= {keyIndex}
                  >
                    <img
                      className={`w-24 h-24 border-${currentDigsite}OffsetAccent border-special-sm rounded-md`}
                      src={nft.image}
                    />
                    <p
                      className={"font-viet uppercase tracking-spaced text-lg"}
                    >
                      {nft.name}
                    </p>
                  </a>
                );
              })
            ) : (
              <a
                className="  font-viet uppercase tracking-spaced text-lg w-full text-center cursor-pointer"
                onClick={() => getNFTs()}
              >
                No omens left to dig with, mistake? Refresh Omens now.
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
function flag(arg0: string[], flag: any) {
  throw new Error("Function not implemented.");
}

