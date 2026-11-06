{
  description = "m.odul.ar";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = {nixpkgs, ...}: let
    systems = ["aarch64-darwin" "aarch64-linux" "x86_64-linux"];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
  in {
    devShells = forAllSystems (pkgs: {
      default = pkgs.mkShellNoCC {
        packages = [
          # Matches node-version in .github/workflows/publish.yml.
          pkgs.nodejs_24
        ];

        # Fixed settings belong in env.
        env = {
          # npm comes from nixpkgs, so its prompts to upgrade itself are noise.
          NPM_CONFIG_UPDATE_NOTIFIER = "false";
        };

        # Paths inside the project are only known when the shell starts.
        # $PWD is the project root under direnv, and under `nix develop ./.nix`
        # when run from the root.
        #
        # NPM_CONFIG_PREFIX keeps `npm install -g` inside the project, and
        # node_modules/.bin puts the project's own tools on PATH.
        shellHook = ''
          export NPM_CONFIG_PREFIX="$PWD/.npm"
          export PATH="$PWD/node_modules/.bin:$NPM_CONFIG_PREFIX/bin:$PATH"
        '';
      };
    });
  };
}
