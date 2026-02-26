{
  description = "Thrall - Browser automation for Bun";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    ...
  }:
    {
      overlays.default = final: prev: {
        thrall-mcp = final.stdenv.mkDerivation {
          pname = "thrall-mcp";
          version = "0.1.0";
          src = self;

          nativeBuildInputs = [final.bun];
          dontStrip = true;

          buildPhase = ''
            export HOME=$TMPDIR
            bun build src/mcp.ts --compile --outfile thrall-mcp
          '';

          installPhase = ''
            mkdir -p $out/bin
            cp thrall-mcp $out/bin/
          '';
        };
      };
    }
    // flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [self.overlays.default];
      };
    in {
      packages = {
        default = pkgs.thrall-mcp;
        thrall-mcp = pkgs.thrall-mcp;
      };

      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          biome
          typescript-go
          nixd
          alejandra
        ];
      };
    });
}
