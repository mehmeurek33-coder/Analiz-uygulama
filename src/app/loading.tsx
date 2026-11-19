import { IskeletKutu, IskeletSatir } from "@/components/Iskelet";

export default function Yukleniyor() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <IskeletSatir genislik="w-32" />
        <IskeletSatir genislik="w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IskeletKutu />
        <IskeletKutu />
        <IskeletKutu />
        <IskeletKutu />
      </div>
      <IskeletKutu yukseklik="h-40" />
      <IskeletKutu yukseklik="h-56" />
    </div>
  );
}
