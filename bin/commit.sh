#!/bin/bash

signing=config
signoff=false
push=true
message='some changes'
message_set=false
positional=()

usage() {
  cat <<'HELP'
Usage: bcommit [options] [-m <message> | message ...]
  -h, --help           Print help and exit
  -v, --version        Print version and exit
  -a, --author         Print tool author and exit
  -m, --message TEXT   Use one argument as the commit message; quote spaces
  -np, --no-push       Commit without pushing
  -s, --sign           Cryptographically sign the commit using Git settings
  -ns, --no-sign       Disable signing, including commit.gpgSign
  --signoff           Add a Signed-off-by trailer (not a signature)
  --no-signoff         Do not add a Signed-off-by trailer
  --                  Treat remaining arguments as a positional message
Signing follows Git configuration unless --sign or --no-sign is given.
Without a message, the default is "some changes". Multiple positional
arguments are joined with spaces. Do not mix -m with positional arguments.
HELP
}

fail_usage() {
  printf 'Error: %s\n' "$1" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -v|--version) printf 'Version: 1.0.0\n'; exit 0 ;;
    -a|--author) printf 'Author: ZhouHaoyu\n'; exit 0 ;;
    -np|--no-push) push=false ;;
    -s|--sign) signing=yes ;;
    -ns|--no-sign) signing=no ;;
    --signoff) signoff=true ;;
    --no-signoff) signoff=false ;;
    -m|--message)
      [ "$#" -ge 2 ] || fail_usage "$1 requires a message"
      [ "$message_set" = false ] || fail_usage 'Use -m only once'
      message=$2
      message_set=true
      shift
      ;;
    --message=*)
      [ "$message_set" = false ] || fail_usage 'Use --message only once'
      message=${1#--message=}
      message_set=true
      ;;
    --)
      shift
      positional+=("$@")
      break
      ;;
    -*) fail_usage "Unknown option: $1" ;;
    *) positional+=("$1") ;;
  esac
  shift
done

if [ "${#positional[@]}" -gt 0 ]; then
  [ "$message_set" = false ] || fail_usage 'Do not mix -m with a positional message'
  message=${positional[0]}
  for ((i=1; i<${#positional[@]}; i++)); do
    message+=" ${positional[$i]}"
  done
fi
[[ "$message" =~ [^[:space:]] ]] || fail_usage 'The commit message cannot be empty'

commit_args=()
case "$signing" in
  yes) commit_args+=('--gpg-sign') ;;
  no) commit_args+=('--no-gpg-sign') ;;
esac
[ "$signoff" = false ] || commit_args+=('--signoff')

git add . || exit "$?"
git commit "${commit_args[@]}" -m "$message" || exit "$?"
if [ "$push" = true ]; then
  git push || exit "$?"
fi
exit 0
