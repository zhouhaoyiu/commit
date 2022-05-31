#!/bin/bash
sign=true
push=true
message="some changes"
for i in $*
do
  index=$[index+1]
  if [ $i = "-ns" ]
  then
    sign=false
  fi

  if [ $i = "-np" ]
  then
    push=false
  fi

  if [ $i = "-h" ]
  then
    echo "Usage: commit [-ns] [-np] [-h] [-m] [message]"
    echo "  -ns: do not sign the commit"
    echo "  -np: do not push the commit"
    echo "  -h: print this help"
    echo "  -m: commit message"
    echo "  message: commit message"
    exit 0
  fi

  if [ $i = "-v" ]
  then
    echo "Version: 0.1"
  fi

  if [ $i = "-a" ]
  then
    echo "Author: ZhouHaoyu"
  fi

  if [ $i = "-m" ]
  then
    message=''
    _index=`expr $index + 1`
    # -m后所有的参数都是commit message,并且保留空格
    for j in ${@:$_index}
    do
      message=$message$j" "
    done
  fi
done

git add .
echo "git adding..."
if [ $sign = true ]
then
  echo "your commit will be signed"
  git commit -s -m "$message"
else
  git commit -m "$message"
fi

if [ $push = true ]
then
  echo "your commit will be pushed"
  git push
else
  echo "your commit will not be pushed"
fi