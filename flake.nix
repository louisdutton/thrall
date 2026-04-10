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
        bun = prev.bun.overrideAttrs (old: rec {
          version = "1.3.12";
          passthru = old.passthru // {
            sources = {
              "aarch64-darwin" = final.fetchurl {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-darwin-aarch64.zip";
                hash = "sha256-bEu4fdAT7RqNahbjV6PQlJWf1VMLTXBh9/NoDDx86hw=";
              };
              "aarch64-linux" = final.fetchurl {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-aarch64.zip";
                hash = "sha256-xAvA68oRvefXWvSXplSodNDH/Y1qjWAxwXPBDJBkKXs=";
              };
              "x86_64-darwin" = final.fetchurl {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-darwin-x64-baseline.zip";
                hash = "sha256-zE4iEwwrwtlE06KG3gjy7Tf6dBNuWXYPOkZh5hAkZHQ=";
              };
              "x86_64-linux" = final.fetchurl {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-x64.zip";
                hash = "sha256-Edw+4RvBaV4UlzfGyj1WGTAs9DRua4pux5iJZ+8B3cU=";
              };
            };
          };
          src = passthru.sources.${final.stdenvNoCC.hostPlatform.system}
            or (throw "Unsupported system: ${final.stdenvNoCC.hostPlatform.system}");
        });

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
          android-tools
        ];
      };
    });
}
