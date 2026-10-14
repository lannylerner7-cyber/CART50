package main

import "errors"

func bindNetwork(s *State, network string) error {
	if s.Network != "" && s.Network != network {
		return errors.New("journal belongs to another Bitcoin network; use separate volumes")
	}
	if s.Network == "" && network == "main" &&
		(len(s.Wallets) != 0 || len(s.Intents) != 0 || s.ColdIndex != 0 || s.Checkpoint != "") {
		return errors.New("legacy wallet journal cannot be reused on mainnet; provision separate volumes")
	}
	s.Network = network
	return nil
}
