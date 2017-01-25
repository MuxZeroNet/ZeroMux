# coding: utf-8

import io
from Mp4Atom import *

# Stsd box
def StsdBox(content):
    stream = io.BytesIO(content)
    init_position = 4
    stream.seek(init_position, 0)

    avc1_box = FindOneBox(stream, "avc1")

    mp4a_box = None
    if not avc1_box:
        stream.seek(init_position, 0)
        mp4a_box = FindOneBox(stream, "mp4a")

    return {
        "avc1_box": avc1_box,
        "mp4a_box": mp4a_box
    }

def StsdVideoBox(stsd_box):
    return stsd_box["avc1_box"]

def StsdAudioBox(stsd_box):
    return stsd_box["mp4a_box"]

# Avc1 box
def Avc1Box(content):
    stream = io.BytesIO(content)
    stream.seek(78, 0)
    avcC = FindOneBox(stream, "avcC")

    if not avcC:
        raise Mp4Error("No avcC boxes found")

    return {
        "avcC_content": BoxContent(avcC)
    }

def AvcCBytes(avc1Box):
    return avc1Box["avcC_content"]

# AvcC box
def AvcCBox(content):
    return {
        "codec": content[1:4].encode('hex')
    }

def VideoCodec(avcCBox):
    return avcCBox["codec"]

# Descriptor
TAG_TO_NAME = {
  0x03: 'ESDescriptor',
  0x04: 'DecoderConfigDescriptor',
  0x05: 'DecoderSpecificInfo',
  0x06: 'SLConfigDescriptor'
}

def Descriptor(content):
    tag = struct.unpack(">B", content[0:1])[0]
    ptr = 1
    len_byte, length = 0, 0
    while ptr < len(content):
        len_byte = struct.unpack(">B", content[ptr:ptr+1])[0]
        ptr += 1
        length = (length << 7) | (len_byte & 0x7f)
        if not (len_byte & 0x80):
            break

    obj = None
    tag_name = TAG_TO_NAME.get(tag)

    if tag_name == 'ESDescriptor':
        obj = ESDescriptor(content[ptr:])
    elif tag_name == 'DecoderConfigDescriptor':
        obj = DecoderConfigDescriptor(content[ptr:])
    else:
        obj = {
            "buffer": content[ptr:ptr+length]
        }

    obj["tag"] = tag
    obj["tag_name"] = tag_name
    obj["length"] = ptr + length

    return obj

def DescritorArray(content):
    ptr = 0
    obj = {}
    while ptr + 2 <= len(content):
        descriptor = Descriptor(content[ptr:])
        ptr += descriptor["length"]
        tag_name = TAG_TO_NAME.get(descriptor["tag"], 'D' + str(descriptor["tag"]))
        obj[tag_name] = descriptor

    return obj

def ESDescriptor(content):
    flags = struct.unpack(">B", content[2:3])[0]
    ptr = 3
    if (flags & 0x80):
        ptr += 2
    if (flags & 0x40):
        length = struct.unpack(">B", content[ptr:ptr+1])[0]
        ptr += length + 1
    if (flags & 0x20):
        ptr += 2

    return DescritorArray(content[ptr:])


def DecoderConfigDescriptor(content):
    oti = struct.unpack(">B", content[0:1])[0]
    obj = DescritorArray(content[13:])
    obj["oti"] = oti
    return obj

# Mp4a box
def Mp4aBox(content):
    stream = io.BytesIO(content)
    stream.seek(28, 0)

    esds = FindOneBox(stream, "esds", full_box=True)
    if not esds:
        raise Mp4Error("esds box not found")

    return {
        "esds_content": BoxContent(esds)
    }

def EsdsBytes(mp4a_box):
    return mp4a_box["esds_content"]

# Esds box
def EsdsBox(content):
    if len(content) > 1024:
        raise Mp4Error("esds box is too big")

    desc = Descriptor(content)

    esd = desc if desc["tag_name"] == 'ESDescriptor' else {}
    dcd = esd.get('DecoderConfigDescriptor', {})
    oti = dcd.get('oti', 0)

    dsi = dcd.get('DecoderSpecificInfo')

    audio_config = 0
    if dsi:
        audio_config = (struct.unpack(">B", dsi["buffer"][0:1])[0] & 0xf8) >> 3

    mime_codec = None
    if oti:
        mime_codec = hex(oti)[2:]
        if audio_config:
            mime_codec += '.' + str(audio_config)

    return {
        "codec": mime_codec
    }

def AudioCodec(EsdsBox):
    return EsdsBox["codec"]
