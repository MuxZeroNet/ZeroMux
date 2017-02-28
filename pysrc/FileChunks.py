#!/usr/bin/env python2
# coding: utf-8

import os
import shutil
import io

import re
import json
import random

import hashlib

from Mp4Atom import *
from BoxDecoder import *

def FolderNameIsUgly(chosen_folder_name, real_file_name):
    if len(chosen_folder_name) > 55:
        return True

    if chosen_folder_name.strip() == "":
        return True
    if chosen_folder_name.strip("_") == "":
        return True
    if chosen_folder_name.strip(".") == "":
        return True

    unsafe = [
        "/", "\\", "|", ":", ";", "'", '"', "`", "^", "?", "*", "<", ">",
        "+", "#", "%", "&", "$", ",", "[", "]", "!", "~", " ", "..",
    ]
    for unsafe_char in unsafe:
        if unsafe_char in chosen_folder_name:
            return True

    unsafe_suffixes = [
        ".gz", ".zip", ".bz2",
    ]
    for suffix in unsafe_suffixes:
        if chosen_folder_name.endswith(suffix):
            return True

    short_pattern = re.compile("(^[0-9]{1,4}$|^[a-z]{1,2}$)")
    if short_pattern.match(chosen_folder_name):
        return True

    lower_folder_name = chosen_folder_name.strip().lower()
    lower_file_name = real_file_name.strip().lower()

    if len(lower_file_name) > len(lower_folder_name):
        if "." in lower_file_name:
            if lower_folder_name == lower_file_name.split(".")[-1]:
                return True

    return False

def CorrectFolderName(folder_name, in_folder, real_file_name, retry=5):
    # base case
    if retry <= 0:
        return "file_" + os.urandom(8).encode('hex')

    chosen_folder_name = ""

    if folder_name == None:
        folder_name = ""
    if folder_name.strip() != "":
        # folder_name is given: try fixing folder_name
        lower_name = folder_name.strip().lower()
        lower_name = lower_name.replace("_", " ") \
            .replace(". ", ".").replace(" .", ".") \
            .replace("- ", "-").replace(" -", "-") \
            .replace(")", "]").replace("(", "[") \
            .replace("] ", "]").replace(" [", "[").replace("[]", "")

        # valid: [a-z0-9-_\.]
        exp_valid = re.compile("[a-z0-9-_\\.]")

        for s in lower_name:
            if exp_valid.match(s):
                chosen_folder_name += s
            else:
                chosen_folder_name += "_"

        ugly_chars = ["-", "\\.", ",", "_"]
        repl = ugly_chars[-1]
        for char in ugly_chars:
            pattern = re.compile(char + "{2,}") # remove repeated ugly chars
            chosen_folder_name = re.sub(pattern, repl, chosen_folder_name)

        # shorten folder name
        chosen_folder_name = chosen_folder_name[0:50]

        # ^[-\.,_]+
        #  [-\.,_]+$
        exp_trim_left = re.compile("^[" + "".join(ugly_chars) + "]+")
        exp_trim_right = re.compile("[" + "".join(ugly_chars) + "]+$")
        # remove ugly chars at the beginning & end
        chosen_folder_name = re.sub(exp_trim_left, "", chosen_folder_name)
        chosen_folder_name = re.sub(exp_trim_right, "", chosen_folder_name)

        unsafe_suffixes = [
            ".gz", ".zip", ".bz2",
        ]
        for suffix in unsafe_suffixes:
            if chosen_folder_name.endswith(suffix):
                chosen_folder_name = chosen_folder_name + "_"
                break


    base_on = None

    if FolderNameIsUgly(chosen_folder_name, real_file_name):
        # Then don't use chosen folder name. Use real file name instead.
        base_on = os.urandom(4).encode('hex') + "_" + real_file_name
    elif os.path.exists(in_folder + "/" + chosen_folder_name):
        # Add random numbers and try again
        base_on = os.urandom(4).encode('hex') + "_" + chosen_folder_name

    if base_on != None:
        # we need to choose another folder name, for some reason
        return CorrectFolderName(base_on, in_folder, real_file_name, retry - 1)
    else:
        return chosen_folder_name


def ChooseChunkSize(file_size):
    SMALL_SIZE, MED_SIZE, MAX_SIZE = 350*1024, 500*1024, 990*1024
    n_pieces = file_size // MED_SIZE - 1
    # file is small, break it up into smaller chunks instead
    if n_pieces <= 5:
        return SMALL_SIZE

    # try to save 1~3 chunks
    chunk_size = int(file_size / n_pieces + 10*1024 + random.SystemRandom().randint(0, 50*1024))
    # avoid small remainder
    remainder = file_size % chunk_size
    if remainder > 0 and remainder <= 25*1024:
        n_pieces = file_size // chunk_size
        chunk_size = int(file_size // n_pieces + 256)

    if chunk_size < SMALL_SIZE or chunk_size > MAX_SIZE:
        return MED_SIZE
    else:
        return chunk_size

def SplitFile(filePath, savePath, relPath, givenFileName, idealChunkSize=500*1024):
    relativePath = relPath
    if not relPath:
        print "Using {\"cd\": \"json\"} ..."
        relativePath = "."

    fileSize = os.path.getsize(filePath)

    filePartList = []

    fileSha256 = hashlib.sha256()
    fileInfo = open(filePath, 'rb')


    chunkOrder = 0
    chunkBytes = fileInfo.read(idealChunkSize)
    actualChunkSize = len(chunkBytes)

    while actualChunkSize > 0:
        fileSha256.update(chunkBytes)

        chunkSha256 = hashlib.sha256(chunkBytes).hexdigest()

        chunkFileName = "%s.dat" % str(chunkOrder)
        chunkRelativePath = relativePath + "/" + chunkFileName

        info = {
            "path": chunkRelativePath,
            "order": chunkOrder,
            "size": actualChunkSize,
            "hashingAlgorithm": "sha256",
            "hash": chunkSha256
        }
        filePartList.append(info)

        chunkFilePath = savePath + "/" + chunkFileName
        chunkFileInfo = open(chunkFilePath, 'wb')
        chunkFileInfo.write(chunkBytes)
        chunkFileInfo.flush()
        chunkFileInfo.close()

        if chunkOrder % 79 == 0:
            print str(chunkOrder) + "."

        chunkOrder += 1
        chunkBytes = fileInfo.read(idealChunkSize)
        actualChunkSize = len(chunkBytes)


    wholeFileSha256 = fileSha256.hexdigest()

    bigFileDict = {
        "fileName": givenFileName,
        "size": fileSize,
        "hashingAlgorithm": "sha256",
        "hash": wholeFileSha256
    }

    if not relPath:
        bigFileDict["cd"] = "json"

    jsonContent = {
        "bigFile": bigFileDict,
        "fileParts": filePartList
    }

    jsonFileInfo = io.open(savePath + "/file.json", 'w', encoding='utf-8')
    jsonFileInfo.write( unicode(json.dumps(jsonContent)) )
    jsonFileInfo.flush()
    jsonFileInfo.close()

    fileInfo.close()

def SaveMetadataFile(metadata, out_folder):
    if len(metadata) > 0:
        print "Saving %s/metadata.json ..." % out_folder

        file_info = io.open(out_folder + "/metadata.json", 'w', encoding='utf-8')
        file_info.write( unicode(json.dumps(metadata)) )
        file_info.flush()
        file_info.close()

    return len(metadata) > 0


def SaveStreamingData(in_file, out_folder):
    metadata = {}

    if in_file.lower().endswith(".mp4"):
        out_file = out_folder + "/moov_box.dat"
        moov_box = TrySaveMoov(in_file, out_file) # save moov
        if moov_box:
            try:
                codec_string = Mp4CodecString(moov_box)
                if codec_string:
                    metadata["format"] = "mp4"
                    metadata["codecString"] = codec_string
            except Mp4Error:
                pass

    return SaveMetadataFile(metadata, out_folder)

def TrySaveMoov(mp4_file, out_file):
    file_info = io.open(mp4_file, 'rb')
    moov_box = TryGetMoov(file_info)
    file_info.close()

    if not moov_box:
        return None

    print "Saving moov box... " + out_file

    out_file = io.open(out_file, 'wb')
    out_file.write(PackBox(moov_box))
    out_file.flush()
    out_file.close()

    return moov_box

def TryGetMoov(file_info, check_fmp4=True):
    file_info.seek(0, 0)
    moov_box = None
    try:
        moov_box = FindOneBox(file_info, 'moov')
    except Mp4Error, e:
        print "# Cannot find moov box - " + e.message
        return None

    if not check_fmp4:
        return moov_box

    movie_fragment_box = None
    try:
        movie_fragment_box = FindOneBox(file_info, 'moof')
    except Mp4Error, e:
        print "# Mp4 Decoding error - " + e.message
        return None

    if movie_fragment_box == None:
        return moov_box
    else:
        return None

def Mp4CodecString(moov_box):
    moov_stream = io.BytesIO(BoxContent(moov_box))
    video, audio = "", ""

    stsd = FindByPath(moov_stream, "trak.mdia.minf.stbl.stsd!")
    while stsd and not (video and audio):
        stsd_box = StsdBox(BoxContent(stsd))
        avc1 = StsdVideoBox(stsd_box)
        mp4a = StsdAudioBox(stsd_box)

        if (not video) and avc1:
            # parse avcC
            avc1_box = Avc1Box(BoxContent(avc1))
            avcC_box = AvcCBox(AvcCBytes(avc1_box))
            video = VideoCodec(avcC_box)
        if (not audio) and mp4a:
            # parse mp4a
            mp4a_box = Mp4aBox(BoxContent(mp4a))
            esds_box = EsdsBox(EsdsBytes(mp4a_box))
            audio = AudioCodec(esds_box)

        stsd = FindByPath(moov_stream, "trak.mdia.minf.stbl.stsd!")

    if video and audio:
        return 'video/mp4; codecs="avc1.%s, mp4a.%s"' % (video, audio)
    elif video:
        return 'video/mp4; codecs="avc1.%s"' % video
    elif audio:
        return 'video/mp4; codecs="mp4a.%s"' % audio
    else:
        raise Mp4Error("Unsupported codecs")


def DeleteFileJsonFolder(file_json_path, file_id, files_folder_path, trash_path):
    if not file_json_path:
        print "file.json not deleted: no path specified"
        return

    # ^files/([A-Za-z0-9-_\.]+)/file\.json$
    exp = re.compile("^files/([A-Za-z0-9-_\\.]+)/file\\.json$")
    matches = exp.findall(file_json_path)

    if len(matches) != 1:
        print "file.json not deleted: user has changed fileJson value", file_json_path
        return

    folder_name = matches[0]
    file_json_folder_path = files_folder_path + "/" + folder_name

    if not os.path.isfile(file_json_folder_path + "/file.json"):
        print "file.json not deleted: file.json not found"
        return

    # make trash
    if not os.path.isdir(trash_path):
        os.mkdir(trash_path)

    counter = 0
    new_folder_name = file_id.strip() if file_id.strip() else "NoName"
    while os.path.exists(trash_path + "/" + new_folder_name):
        counter = counter + 1
        new_folder_name = file_id.strip() if file_id.strip() else "NoName"
        new_folder_name = new_folder_name + "_" + str(counter)

    new_folder_path = trash_path + "/" + new_folder_name + "/"
    os.mkdir(new_folder_path)

    print "Moving", file_json_folder_path, "to", new_folder_path, "..."
    shutil.move(file_json_folder_path, new_folder_path)
