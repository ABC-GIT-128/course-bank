/* 课程数据：test
 * 由投稿自动生成（scripts/add-question.js），可继续手工编辑。
 */
window.OC = {
  "course": {
    "id": "test",
    "title": "test",
    "subtitle": "期末刷题",
    "college": "专业基础课",
    "teacher": "",
    "terms": [
      "2026-autumn"
    ],
    "termLabels": {
      "2026-autumn": "2026 秋"
    },
    "updatedAt": "2026-10-29",
    "license": "CC BY-NC-SA 4.0",
    "chapterNames": {
      "1": "第1章"
    },
    "keywords": [
      "test",
      "第1章"
    ]
  },
  "questions": [
    {
      "type": "choice",
      "ch": 1,
      "raw": {
        "ans": "B",
        "exp": "文档中明确写到设置交叉编译器的目标架构为 arm-linux，后续的所有前缀（如 arm-linux-gcc）也是基于这个变量生成的。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在构建交叉编译器的环境变量脚本 setbuildenv.sh 中，TARGET 变量的值通常设置为什么？（　）",
      "opts": [
        "x86_64-linux",
        "arm-linux",
        "ubuntu-linux",
        "arm-none"
      ],
      "ans": 1,
      "exp": "<p>文档中明确写到设置交叉编译器的目标架构为 arm-linux，后续的所有前缀（如 arm-linux-gcc）也是基于这个变量生成的。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-01",
      "warn": []
    },
    {
      "type": "choice",
      "ch": 1,
      "raw": {
        "ans": "B",
        "exp": "文档的错误解决方法明确指出，报错是因为在设置好内核配置后，没有使用命令生成 include/linux/version.h 文件，导致 glibc 认为内核头文件不完整。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在安装 glibc 头文件步骤中，如果直接配置（configure）可能会报错“GNU libc requires kernel header files from Linux 2.0.10 or later to be installed before configuring”，其根本解决方法是？（　）",
      "opts": [
        "重新安装更高版本的 gcc",
        "在安装内核头文件的过程中，必须执行相应的命令生成 include/linux/version.h 文件",
        "修改 makefile 中的编译参数",
        "删除已有的 linux 内核源码目录"
      ],
      "ans": 1,
      "exp": "<p>文档的错误解决方法明确指出，报错是因为在设置好内核配置后，没有使用命令生成 include/linux/version.h 文件，导致 glibc 认为内核头文件不完整。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-02",
      "warn": []
    },
    {
      "type": "choice",
      "ch": 1,
      "raw": {
        "ans": "B",
        "exp": "文档提示，缺少 glibc 头文件时遇到 pthread.h 报错，是因为交叉编译器尝试开启线程支持，加上 --disable-threads 即可在无 glibc 时暂时关闭该功能。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在安装 gcc 引导编译器（bootstrap gcc）时，如果没有安装 glibc 头文件，会导致找不到 pthread.h 而报错，此时需要在 configure 后添加什么选项来解决？（　）",
      "opts": [
        "--disable-shared",
        "--disable-threads",
        "--without-headers",
        "--with-newlib"
      ],
      "ans": 1,
      "exp": "<p>文档提示，缺少 glibc 头文件时遇到 pthread.h 报错，是因为交叉编译器尝试开启线程支持，加上 --disable-threads 即可在无 glibc 时暂时关闭该功能。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-03",
      "warn": []
    },
    {
      "type": "choice",
      "ch": 1,
      "raw": {
        "ans": "B",
        "exp": "文档给出的解决方法是通过 ln -s 命令，将已存在的 libgcc.a 软链接为 libgcc_eh.a，以满足链接器的查找需求。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在编译过程中出现 “cannot find -lgcc_eh” 错误，正确的解决方法是？（　）",
      "opts": [
        "重新安装 binutils",
        "创建 libgcc.a 到 libgcc_eh.a 的软链接",
        "修改 glibc 的配置参数",
        "清理 build 目录重新编译"
      ],
      "ans": 1,
      "exp": "<p>文档给出的解决方法是通过 ln -s 命令，将已存在的 libgcc.a 软链接为 libgcc_eh.a，以满足链接器的查找需求。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-04",
      "warn": []
    },
    {
      "type": "choice",
      "ch": 1,
      "raw": {
        "ans": "B",
        "exp": "文档指出，需要使用 vi 编辑 libc.so，将列举的链接库绝对路径（如 /lib/libc.so.6）中的 /lib/ 字样全部去掉，变为相对路径。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在安装全套 gcc 编译器时，报错 “/lib/libc.so.6: file not recognized: File format not recognized”，其原因是 libc.so 文件中包含了主机的绝对路径。正确的修改方法是将该文件中所有的哪个字样除掉？（　）",
      "opts": [
        "/usr/",
        "/lib/",
        "/bin/",
        "/home/"
      ],
      "ans": 1,
      "exp": "<p>文档指出，需要使用 vi 编辑 libc.so，将列举的链接库绝对路径（如 /lib/libc.so.6）中的 /lib/ 字样全部去掉，变为相对路径。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-05",
      "warn": []
    },
    {
      "type": "fill",
      "ch": 1,
      "raw": {
        "ans": "export",
        "exp": "文档中的脚本代码使用了 export 命令来导出多个变量，如 export PRJROOT TARGET PREFIX 等。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在编写 setbuildenv.sh 脚本时，通常会使用 ＿＿＿ 命令将 PRJROOT、TARGET、PREFIX 等变量导出，使其在当前 Shell 及其子进程中生效。",
      "blanks": [
        [
          "export"
        ]
      ],
      "blankCount": 1,
      "exp": "<p>文档中的脚本代码使用了 export 命令来导出多个变量，如 export PRJROOT TARGET PREFIX 等。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-06",
      "warn": []
    },
    {
      "type": "fill",
      "ch": 1,
      "raw": {
        "ans": "src-dir",
        "exp": "环境变量脚本中定义了 SRC_DIR=$PRJROOT/src-dir，后续解压 linux、binutils 等都是解压到该目录或从此目录提取。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在构建交叉工具链的目录结构中，源代码包应当解压存放在 ＿＿＿ 目录下。",
      "blanks": [
        [
          "src-dir"
        ]
      ],
      "blankCount": 1,
      "exp": "<p>环境变量脚本中定义了 SRC_DIR=$PRJROOT/src-dir，后续解压 linux、binutils 等都是解压到该目录或从此目录提取。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-07",
      "warn": []
    },
    {
      "type": "fill",
      "ch": 1,
      "raw": {
        "ans": "--prefix",
        "exp": "configure 命令中，--target 指定目标平台，--prefix 用于指定安装目录。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "建立二进制工具时，配置 binutils 使用的两个关键参数是 --target=$TARGET 和 ＿＿＿=$PREFIX，后者用于指定生成的工具链安装路径。",
      "blanks": [
        [
          "--prefix"
        ]
      ],
      "blankCount": 1,
      "exp": "<p>configure 命令中，--target 指定目标平台，--prefix 用于指定安装目录。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-08",
      "warn": []
    },
    {
      "type": "fill",
      "ch": 1,
      "raw": {
        "ans": "libc_cv_forced_unwind",
        "exp": "文档中针对此错误给出的解决方法是手动传入变量 libc_cv_forced_unwind=yes 来欺骗 configure 脚本，使其认为支持此特性。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "为解决 glibc 编译时 “forced unwind support is required” 的错误，需要在 configure 后面加上 ＿＿＿=yes 选项。",
      "blanks": [
        [
          "libc_cv_forced_unwind"
        ]
      ],
      "blankCount": 1,
      "exp": "<p>文档中针对此错误给出的解决方法是手动传入变量 libc_cv_forced_unwind=yes 来欺骗 configure 脚本，使其认为支持此特性。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-09",
      "warn": []
    },
    {
      "type": "fill",
      "ch": 1,
      "raw": {
        "ans": "#define FE_TOWARDZERO 0xc00000",
        "exp": "文档提示从 fenv.h 中找到定义并添加到报错文件中，即 #define FE_TOWARDZERO 0xc00000（同时还要添加 FE_INEXACT 16）。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "",
        "unit": ""
      },
      "q": "在修改 glibc 源码以解决编译错误时，若遇到 “FE_TOWARDZERO undeclared”，需要在 s_fma.c 文件中的 #include <ieee754.h> 下方添加 ＿＿＿ 的宏定义。",
      "blanks": [
        [
          "#define FE_TOWARDZERO 0xc00000"
        ]
      ],
      "blankCount": 1,
      "exp": "<p>文档提示从 fenv.h 中找到定义并添加到报错文件中，即 #define FE_TOWARDZERO 0xc00000（同时还要添加 FE_INEXACT 16）。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-10",
      "warn": []
    },
    {
      "type": "term",
      "ch": 1,
      "raw": {
        "ans": "交叉编译器是指在一种计算机环境中运行的编译程序，它能编译出在另一种完全不同的计算机环境中运行的可执行代码的编译器。",
        "exp": "在文档中，使用 PC 机（如 x86 架构）的 gcc 去编译出能在 ARM 架构上运行的程序，这就是交叉编译的核心概念。",
        "ref": "项目十三 交叉编译器构建 一、项目目的",
        "kw": "编译器|不同环境|跨平台|目标架构",
        "unit": ""
      },
      "q": "交叉编译器",
      "kw": [
        [
          "编译器"
        ],
        [
          "不同环境"
        ],
        [
          "跨平台"
        ],
        [
          "目标架构"
        ]
      ],
      "exp": "<p>在文档中，使用 PC 机（如 x86 架构）的 gcc 去编译出能在 ARM 架构上运行的程序，这就是交叉编译的核心概念。</p>",
      "ref": "项目十三 交叉编译器构建 一、项目目的",
      "id": "b7-11",
      "warn": []
    },
    {
      "type": "term",
      "ch": 1,
      "raw": {
        "ans": "binutils 是一组二进制工具的集合，包含如汇编器（as）、链接器（ld）、目标文件复制（objcopy）等工具，是构建完整编译器不可或缺的基础。",
        "exp": "文档明确提到生成的 arm-linux-ar、arm-linux-as、arm-linux-ld 等是编译其他交叉程序的基础，因此必须放到第一步进行安装。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "二进制工具|基础|汇编器|链接器",
        "unit": ""
      },
      "q": "binutils",
      "kw": [
        [
          "二进制工具"
        ],
        [
          "基础"
        ],
        [
          "汇编器"
        ],
        [
          "链接器"
        ]
      ],
      "exp": "<p>文档明确提到生成的 arm-linux-ar、arm-linux-as、arm-linux-ld 等是编译其他交叉程序的基础，因此必须放到第一步进行安装。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-12",
      "warn": []
    },
    {
      "type": "term",
      "ch": 1,
      "raw": {
        "ans": "引导编译器是指在缺乏目标平台 C 库的情况下，为了能够编译出目标平台的 C 库（如 glibc）而预先构建的一个功能受限的临时交叉编译器。",
        "exp": "文档中提到，因为当时没有 glibc 的支持，只能先利用主机 gcc 编译出一个只能编译 C 语言、不支持线程的简易版 gcc，专门用来生成后面的 glibc。",
        "ref": "项目十三 交叉编译器构建 四、项目步骤",
        "kw": "临时编译器|功能受限|编译glibc|基础",
        "unit": ""
      },
      "q": "引导编译器（bootstrap gcc）",
      "kw": [
        [
          "临时编译器"
        ],
        [
          "功能受限"
        ],
        [
          "编译glibc"
        ],
        [
          "基础"
        ]
      ],
      "exp": "<p>文档中提到，因为当时没有 glibc 的支持，只能先利用主机 gcc 编译出一个只能编译 C 语言、不支持线程的简易版 gcc，专门用来生成后面的 glibc。</p>",
      "ref": "项目十三 交叉编译器构建 四、项目步骤",
      "id": "b7-13",
      "warn": []
    }
  ]
};
