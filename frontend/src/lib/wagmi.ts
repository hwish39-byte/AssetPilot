"use client";

import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "./chains";

export const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ target: "metaMask" }), injected()],
  transports: {
    [monadTestnet.id]: http()
  },
  ssr: true
});
