#!/usr/bin/env python2
# coding: utf-8

import os
import shutil

import re
import json
import random

import hashlib
import codecs



def FolderNameIsUgly(chosen_folder_name, real_file_name):
    if len(chosen_folder_name) > 50:
        return True

    if chosen_folder_name.strip() == "":
        return True
    if chosen_folder_name.strip("_") == "":
        return True
    if chosen_folder_name.strip(".") == "":
        return True

    unsafe = [
        "/", "\\", "|", ":", ";", "'", '"', "`", "^", "?", "*", "<", ">",
        "+", "#", "%", "&", "$", ",", "[", "]", "!", "~",
    ]
    for unsafe_char in unsafe:
        if unsafe_char in chosen_folder_name:
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


    base_on = None

    if FolderNameIsUgly(chosen_folder_name, real_file_name):
        # try making a folder name by adding random numbers
        base_on = os.urandom(4).encode('hex') + "_" + real_file_name
    elif os.path.exists(in_folder + "/" + chosen_folder_name):
        # try making a folder name out of real file name
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

def SplitFile(filePath, savePath, relativePath, givenFileName, idealChunkSize=500*1024):
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

    jsonContent = {
        "bigFile": bigFileDict,
        "fileParts": filePartList
    }

    jsonFileInfo = codecs.open(savePath + "/file.json", 'w', 'utf-8')
    jsonFileInfo.write( unicode(json.dumps(jsonContent)) )
    jsonFileInfo.flush()
    jsonFileInfo.close()



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
