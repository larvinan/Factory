export default function getDetectionList(params?: any) {
  const list = [
    {
      id: 101,
      timestamp: new Date().toISOString(),
      deviceId: 'mp_user',
      camera: 'mobile',
      total: 3,
      compliant: 2,
      noHelmet: 1
    },
    {
      id: 100,
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      deviceId: 'esp32_cam_01',
      camera: 'cam_01',
      total: 5,
      compliant: 5,
      noHelmet: 0
    },
    {
      id: 99,
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      deviceId: 'esp32_cam_02',
      camera: 'cam_02',
      total: 4,
      compliant: 3,
      noHelmet: 1
    },
    {
      id: 98,
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      deviceId: 'esp32_cam_01',
      camera: 'cam_01',
      total: 2,
      compliant: 2,
      noHelmet: 0
    },
    {
      id: 97,
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      deviceId: 'esp32_cam_03',
      camera: 'cam_03',
      total: 6,
      compliant: 4,
      noHelmet: 2
    }
  ];

  const page = params?.page || 1;
  const pageSize = params?.pageSize || 10;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    list: list.slice(start, end),
    total: list.length,
    page,
    pageSize
  };
}
