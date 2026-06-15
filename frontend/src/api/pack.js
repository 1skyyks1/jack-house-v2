import request from "@/utils/request";

// 获取所有包
export function packList(page, pageSize, searchKeys, tags, type, ranked, loved, sort) {
    return request({
        url: '/pack',
        method: "GET",
        params: {
            page,
            pageSize,
            searchKeys,
            tags,
            type,
            ranked,
            loved,
            sort
        }
    })
}

// 获取指定包信息
export function packById(pack_id) {
    return request({
        url: `/pack/${pack_id}`,
        method: "GET",
    })
}

// 创建图包
export function packCreate(data) {
    return request({
        url: '/pack',
        method: "POST",
        data: data,
    })
}

// 从osu获取图包信息
export function packDetailFromOsu(bid) {
    return request({
        url: `/pack/osu/${bid}`,
        method: "GET",
    })
}

// 从osu录入图包信息
export function packFromOsu(bid, data) {
    return request({
        url: `/pack/osu/${bid}`,
        method: "POST",
        data: data,
    })
}

// 更新图包信息
export function updatePackFromOsu(bid) {
    return request({
        url: `/pack/osu/${bid}`,
        method: "PUT",
    })
}
