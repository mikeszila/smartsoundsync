#!/bin/bash -x

dsptoolkit set-volume 0%
dsptoolkit set-limit 0db

dsptoolkit write-mem 0xF106 0x0003
dsptoolkit write-mem 0xF146 0x0004
dsptoolkit write-mem 0xF107 0x0000
dsptoolkit write-mem 0xF195 0x0000
dsptoolkit write-mem 0xF194 0x0033
dsptoolkit write-mem 0xF21C 0x6C40

dsptoolkit write-reg 0xF106 0x0003
dsptoolkit write-reg 0xF146 0x0004
dsptoolkit write-reg 0xF107 0x0000
dsptoolkit write-reg 0xF195 0x0000
dsptoolkit write-reg 0xF194 0x0033
dsptoolkit write-reg 0xF21C 0x6C40