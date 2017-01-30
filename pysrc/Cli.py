# coding: utf-8

import argparse
import os

from FileChunks import *

def Main():
    epilog_lines = [
        "Suppose you have a 01.mp4 in your My Documents folder.",
        "You want to slice it into 500kb chunks,",
        "save these chunks to E:\\MySite\\loader\\files\\yosuga_no_sora\\",
        "and have this friendly name \"Yosuga no Sora.mp4\" displayed.",
        "You type:",
        "",
        "wizard.py -i \"D:\\My Documents\\01.mp4\"",
        "          -out_dir \"E:\\MySite\\loader\\files\"",
        "          -chunk_size 500",
        "          -container \"yosuga_no_sora\"",
        "          -name \"Yosuga no Sora.mp4\"",
        "",
        "Say you uploaded an MP4 file by using an old version of ZeroMux,",
        "but you want to make your video stream-able.",
        "To get the 'moov' box of your MP4 file,",
        "you type:",
        "",
        "wizard.py -i \"D:\\My Documents\\01.mp4\" -moov_out moov_box.dat",
    ]

    example_string = "Example: "
    indentation = len(example_string)

    epilog = ("_" * (indentation-1)) + "\n" + example_string
    epilog += ("\n" + " " * indentation).join(epilog_lines)
    epilog += "\n "

    parser = argparse.ArgumentParser(formatter_class=argparse.RawDescriptionHelpFormatter, \
        description="ZeroMux Configuration Wizard", epilog=epilog)

    parser.add_argument("-i", action="store", dest="input", help="file to split")
    parser.add_argument("-out_dir", action="store", dest="folder", \
        help="""output directory. Note that a new folder (called container folder) will be created
        in the specified directory to store the chunks.""")

    parser.add_argument("-chunk_size", action="store", dest="size_kb", type=int, \
        help="""[optional] chunk size in KB.
        If not specified, a reasonable value will be calculated and chosen.""")

    parser.add_argument("-rel_path", action="store", dest="relative_path", \
        help="""[DEPRECATED] [optional] relative folder path with respect to __file loading page__.
        (e.g. http://zero.net/1YourSite/loader/files/big_file/*.dat => -rel_path \"files/big_file\")
        Specifying rel_path will also change the name of the new folder created.""")
    parser.add_argument("-container", action="store", dest="container_name", \
        help="""[optional] specify the folder name that is used to contain the file chunks.
        If the specified folder exists, a new folder name will be chosen automatically.
        Illegal chars in specified folder name will
        be replaced with underlines (_)""")
    parser.add_argument("-name", action="store", dest="name", \
        help="[optional] specify a friendly file name to be displayed")

    parser.add_argument("-moov_out", action="store", dest="moov_path", \
        help="""[optional] Don't slice any file. Try to only extract the 'moov' box
        of given input file (MP4 format) and write the box to `moov_path`.
        """)

    args = parser.parse_args()

    if args.input and args.moov_path:
        MoovMain(args.input, args.moov_path)
    else:
        CliMain(args.input, args.folder, args.size_kb, args.relative_path, args.container_name, args.name)

def MoovMain(input_file, out_file):
    if not os.path.isfile(input_file):
        raise Exception("Input File does not exist.")
    if os.path.isdir(out_file):
        raise Exception("Hey! moov_path should not be a folder.")
    if os.path.isfile(out_file):
        y_n = raw_input(out_file + "\n    is an existing file. Override? ")
        if not y_n.lower().startswith("y"):
            raise Exception("Aborted by user.")

    moov_box = TrySaveMoov(input_file, out_file)
    if moov_box:
        print "Moov box saved to " + out_file
    else:
        print "[!] No moov box was saved."

def CliMain(input_file, out_folder, size_kb, rel_path, container_name, friendly_name):
    if not input_file or not os.path.isfile(input_file):
        raise Exception("Input File does not exist.")
    if not out_folder or not os.path.isdir(out_folder):
        raise Exception("Out Folder does not exist.")
    if size_kb != None:
        if size_kb <= 1:
            raise Exception("Chunk size is too small.")
        if size_kb > 10000:
            raise Exception("Chunk size is too large.")

    # Read chunk size
    size_bytes = 0
    if size_kb:
        size_bytes = size_kb * 1024
    else:
        size_bytes = ChooseChunkSize(os.path.getsize(input_file))

    chosen_folder_name = ""
    if not rel_path:
        input_file_name = os.path.basename(input_file)
        desired_folder_name = container_name or input_file_name
        chosen_folder_name = CorrectFolderName(desired_folder_name, out_folder, input_file_name)
    else:
        rel_path = rel_path.replace("\\", "/").strip()
        if rel_path.endswith("/"):
            rel_path = rel_path[0:-1]
        chosen_folder_name = os.path.basename(rel_path)

    chunk_folder = out_folder + "/" + chosen_folder_name
    if os.path.exists(chunk_folder):
        raise Exception("Failed to assign chunk folder name - folder already exists.")

    if not friendly_name or not friendly_name.strip():
        friendly_name = os.path.basename(input_file) or "no_name"

    print "\n".join([
        "Using arguments:",
        "Input file: " + input_file,
        "Output directory for chunks: " + chunk_folder + "/",
        "Chunk size: " + "%.2f" % (1.0*size_bytes/1024) + "KB",
        "Relative path: " + (rel_path or ". (chdir)"),
        "Friendly name: " + friendly_name,
        "",
    ])

    os.mkdir(chunk_folder)
    SplitFile(input_file, chunk_folder, rel_path, friendly_name, size_bytes)

    print "Done."
